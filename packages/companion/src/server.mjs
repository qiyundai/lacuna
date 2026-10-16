import { createServer } from 'node:http';
import { readFile, stat, mkdir, open, rm } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { CredentialStore } from './credentials.mjs';
import { OpenAIPlan, PlanError, createAuthorization, exchangeCode } from './openai.mjs';
import { analyzeSnapshot } from '../../worker/src/ai/pipeline.ts';

export function allowedRequest(req, origin) {
  return req.headers.host === new URL(origin).host && (!req.headers.origin || req.headers.origin === origin) &&
    (!req.url.startsWith('/api/') && !req.url.startsWith('/companion/') || req.headers['sec-fetch-site'] !== 'cross-site') &&
    (['GET', 'HEAD'].includes(req.method) || req.headers.origin === origin);
}
export async function startCompanion(options = {}) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const port = options.port ?? Number(process.env.LACUNA_PORT ?? 1455);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid LACUNA_PORT');
  const origin = `http://127.0.0.1:${port}`;
  const upstream = new URL(options.apiUrl ?? process.env.LACUNA_API_URL ?? 'https://lacuna-api.pianoquin4126.workers.dev');
  if (upstream.protocol !== 'https:' && !(upstream.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(upstream.hostname))) throw new Error('LACUNA_API_URL must use HTTPS or loopback HTTP');
  const directory = options.dataDir ?? process.env.LACUNA_DATA_DIR ?? join(homedir(), '.lacuna');
  const build = resolve(options.buildDir ?? join(root, 'packages/frontend/build'));
  await stat(join(build, 'index.html')).catch(() => { throw new Error('Build the frontend first: pnpm build:frontend'); });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, 'companion.lock');
  // Refuse a second process so rotating refresh tokens never race across processes.
  const lock = await open(lockPath, 'wx', 0o600).catch(() => { throw new Error('Companion storage is locked. Stop the other companion; after a crash remove companion.lock from its data directory.'); });
  await lock.writeFile(String(process.pid));
  const cleanupLock = async () => { await lock.close(); await rm(lockPath, { force: true }); };
  let store;
  try { store = options.store ?? await new CredentialStore(directory).load(); } catch (err) { await cleanupLock(); throw err; }
  const plan = options.plan ?? new OpenAIPlan(store);
  const pending = new Map(), jobs = new Map(), sessions = new Map();
  async function cloud(path, token, method = 'GET', body, signal) {
    const res = await fetch(new URL(path, upstream), { method, redirect: 'error', signal: signal ?? AbortSignal.timeout(30000),
      headers: { ...(token ? { Authorization: token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new PlanError(res.status === 401 ? 'UNAUTHORIZED' : data.error?.code ?? 'HOSTED_ERROR', res.status === 401 ? 'Sign in to Lacuna again.' : 'Could not complete the request to Lacuna. Try again.');
    }
    return res.json();
  }
  async function identity(req) {
    const token = req.headers.authorization;
    if (!token?.startsWith('Bearer ')) throw new PlanError('UNAUTHORIZED', 'Sign in to Lacuna first.');
    return { user: await cloud('/auth/me', token), token };
  }
  async function runJob(userId, token, state) {
    let lease;
    try {
      const status = await cloud('/ai/status', token);
      if (status.provider !== 'chatgpt') { state.state = 'idle'; return; }
      if (!store.data.profiles[userId]) throw new PlanError('RECONNECT', 'Continue with ChatGPT to connect your plan.');
      const models = await plan.models(userId);
      const profile = store.data.profiles[userId];
      const model = profile.model ?? models[0]?.slug;
      if (!models.some(m => m.slug === model)) throw new PlanError('MODEL_UNAVAILABLE', 'Choose an available ChatGPT model in settings.');
      const job = await cloud('/ai/context', token, 'POST');
      lease = job.lease;
      const result = await analyzeSnapshot(job.snapshot, async prompt => {
        state.controller.signal.throwIfAborted();
        if ((await cloud('/ai/status', token)).provider !== 'chatgpt') throw new PlanError('PROVIDER_CHANGED', 'Your reflection provider changed.');
        return plan.generate(userId, model, prompt, state.controller.signal);
      });
      state.controller.signal.throwIfAborted();
      await cloud('/ai/results', token, 'POST', { lease, version: job.snapshot.version, result });
      state.state = 'complete';
      state.code = null; state.message = '';
    } catch (err) {
      state.state = state.controller.signal.aborted ? 'idle' : 'error';
      state.code = err instanceof PlanError ? err.code : 'INFERENCE_FAILED';
      state.message = err instanceof PlanError ? err.message : 'Reflection did not complete. Your saved entries are safe. Try again.';
    } finally {
      if (lease) await cloud(`/ai/job/${encodeURIComponent(lease)}`, token, 'DELETE').catch(() => {});
      state.running = false;
      if (state.rerun && !state.controller.signal.aborted) { state.rerun = false; queueJob(userId, token); }
    }
  }
  function queueJob(userId, token) {
    const existing = jobs.get(userId);
    if (existing?.running) { existing.rerun = true; return; }
    const state = { state: 'running', running: true, rerun: false, code: null, message: '', controller: new AbortController() };
    jobs.set(userId, state);
    state.promise = runJob(userId, token, state);
  }
  function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }
  async function body(req) {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 262144) throw new PlanError('TOO_LARGE', 'Request too large'); chunks.push(chunk); }
    return size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    try {
      const url = new URL(req.url, origin);
      if (!allowedRequest(req, origin)) return json(res, { error: { code: 'FORBIDDEN', message: 'Open Lacuna on this computer to continue' } }, 403);
      const callback = url.pathname === '/auth/callback';
      const localApi = url.pathname.startsWith('/companion/') || url.pathname.startsWith('/api/');
      const sessionId = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('lacuna_companion='))?.slice('lacuna_companion='.length);
      const browserSession = sessions.get(sessionId);
      if ((callback || localApi) && !browserSession) return json(res, { error: { code: 'FORBIDDEN', message: 'Open the companion home page first' } }, 403);
      if (callback) {
        const attempt = pending.get(url.searchParams.get('state'));
        if (!attempt || attempt.sessionId !== sessionId) throw new PlanError('INVALID_CALLBACK', 'Sign-in expired. Return to Lacuna and connect again.');
        pending.delete(attempt.state);
        const issued = url.searchParams.get('client_id');
        if (attempt.expires <= Date.now()) throw new PlanError('INVALID_CALLBACK', 'Sign-in expired. Connect again.');
        // Keep an issued registration even if exchange fails; never exchange with dynamic_agent_client.
        if (issued && issued !== 'dynamic_agent_client' && attempt.clientId === 'dynamic_agent_client' && !url.searchParams.has('error')) {
          store.data.registrations.signin = { client_id: issued };
          await store.save();
        }
        try {
          const profile = await (options.exchangeCode ?? exchangeCode)(attempt, url.searchParams);
          const result = await cloud('/auth/openai/complete', undefined, 'POST', { challenge: attempt.challenge, clientId: profile.client_id, idToken: profile.id_token });
          if (jobs.get(result.user.id)?.running) throw new PlanError('BUSY', 'Wait for your current reflection before reconnecting.');
          store.data.profiles[result.user.id] = profile;
          const registration = { client_id: profile.client_id, subject: profile.subject, id_token: profile.id_token };
          store.data.registrations[result.user.id] = registration;
          store.data.registrations.signin = registration;
          await store.save();
          browserSession.result = result;
          browserSession.expires = Date.now() + 60000;
          browserSession.error = null;
        } catch (err) { browserSession.error = err instanceof PlanError ? err.message : 'ChatGPT identity could not be verified. Connect again.'; }
        res.writeHead(303, { Location: '/' }); return res.end();
      }
      if (url.pathname.startsWith('/companion/')) {
        if (url.pathname === '/companion/session' && req.method === 'GET') {
          const result = browserSession.expires > Date.now() ? browserSession.result : null;
          const error = browserSession.error;
          delete browserSession.result; delete browserSession.error;
          return json(res, { session: result ?? null, error: error ?? null });
        }
        if (url.pathname === '/companion/connect' && req.method === 'POST') {
          const value = await body(req);
          if (value.consent !== true) throw new PlanError('CONSENT_REQUIRED', 'Acknowledge data and privacy first.');
          for (const [key, attempt] of pending) if (attempt.sessionId === sessionId || attempt.expires < Date.now()) pending.delete(key);
          const challenge = await cloud('/auth/openai/start', undefined, 'POST', { consent: true });
          const attempt = { ...createAuthorization(store.data.hostId, `${origin}/auth/callback`, store.data.registrations.signin, challenge.nonce), challenge: challenge.id, sessionId };
          pending.set(attempt.state, attempt);
          browserSession.error = null; delete browserSession.result;
          return json(res, { url: attempt.url });
        }
        const { user, token } = await identity(req);
        const profile = store.data.profiles[user.id];
        if (url.pathname === '/companion/status' && req.method === 'GET') {
          const state = jobs.get(user.id);
          return json(res, { connected: !!profile, planEnabled: !!profile?.scopes?.includes('chatgpt.tokens.use.direct') && !!profile?.scopes?.includes('resource.invoke'), email: profile?.email ?? null, model: profile?.model ?? null,
            state: state?.state ?? 'idle', code: state?.code ?? null, message: state?.message ?? '' });
        }
        if (url.pathname === '/companion/disconnect' && req.method === 'POST') {
          for (const [key, attempt] of pending) if (attempt.sessionId === sessionId) pending.delete(key);
          delete browserSession.result;
          jobs.get(user.id)?.controller?.abort();
          const revoked = await plan.disconnect(user.id);
          jobs.delete(user.id);
          return json(res, { revoked });
        }
        if (url.pathname === '/companion/models' && req.method === 'GET') return json(res, await plan.models(user.id));
        if (url.pathname === '/companion/test' && req.method === 'POST') {
          const models = await plan.models(user.id);
          const model = profile?.model ?? models[0]?.slug;
          if (!models.some(m => m.slug === model)) throw new PlanError('MODEL_UNAVAILABLE', 'Choose an available model.');
          const text = await plan.generate(user.id, model, { system: 'You are testing a connection. Reply with exactly: Lacuna is connected.', user: 'Confirm this connection.' });
          return json(res, { ok: true, text });
        }
        if (url.pathname === '/companion/model' && req.method === 'PATCH') {
          const value = await body(req);
          const models = await plan.models(user.id);
          if (!profile || !models.some(m => m.slug === value.model)) throw new PlanError('MODEL_UNAVAILABLE', 'Choose an available model.');
          store.data.profiles[user.id].model = value.model; await store.save(); return json(res, { ok: true });
        }
        if (url.pathname === '/companion/reflect' && req.method === 'POST') { queueJob(user.id, token); return json(res, { ok: true }, 202); }
        return json(res, { error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
      }
      if (url.pathname.startsWith('/api/')) {
        const path = url.pathname.slice(4);
        if (!/^\/(auth|entries|patterns|memoir|ai|story|health)(\/|$)/.test(path)) return json(res, { error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
        if (path === '/ai/refresh' && req.method === 'POST') {
          const { user, token } = await identity(req);
          if ((await cloud('/ai/status', token)).provider === 'chatgpt') { queueJob(user.id, token); return json(res, { ok: true }, 202); }
        }
        const payload = ['GET', 'HEAD'].includes(req.method) ? undefined : await body(req);
        if (path === '/ai/provider' && req.method === 'PATCH' && payload?.provider !== 'chatgpt') {
          const { user } = await identity(req);
          jobs.get(user.id)?.controller?.abort();
        }
        const response = await fetch(new URL(path + url.search, upstream), { method: req.method, redirect: 'error', signal: AbortSignal.timeout(30000),
          headers: { ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}), ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload) });
        const text = await response.text();
        json(res, JSON.parse(text), response.status);
        if (response.ok && req.method === 'POST' && path === '/entries') {
          identity(req).then(({ user, token }) => queueJob(user.id, token)).catch(() => {});
        }
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, { error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
      let file = resolve(build, '.' + decodeURIComponent(url.pathname));
      if (file !== build && !file.startsWith(build + sep)) return json(res, { error: { code: 'FORBIDDEN', message: 'Invalid path' } }, 403);
      let info = await stat(file).catch(() => null);
      if (info?.isDirectory()) file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
      if (!info?.isFile()) { if (extname(url.pathname)) return json(res, { error: { code: 'NOT_FOUND', message: 'Not found' } }, 404); file = join(build, 'index.html'); }
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
      let data = await readFile(file);
      if (extname(file) === '.html') {
        data = Buffer.from(data.toString().replace('<head>', '<head><meta name="lacuna-companion" content="1">'));
        if (!browserSession) {
          if (sessions.size >= 200) sessions.delete(sessions.keys().next().value);
          const id = randomBytes(32).toString('hex'); sessions.set(id, {});
          res.setHeader('Set-Cookie', `lacuna_companion=${id}; HttpOnly; SameSite=Lax; Path=/`);
        }
      }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (err) {
      json(res, { error: { code: err instanceof PlanError ? err.code : 'COMPANION_ERROR', message: err instanceof PlanError ? err.message : 'The companion could not complete the request. Try again.' } }, err?.code === 'UNAUTHORIZED' ? 401 : err instanceof SyntaxError ? 400 : 502);
    }
  });
  server.requestTimeout = 35000;
  server.headersTimeout = 15000;
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); } catch (err) { await cleanupLock(); throw err; }
  const close = async () => {
    for (const state of jobs.values()) state.controller?.abort();
    await Promise.allSettled([...jobs.values()].map(state => state.promise));
    await new Promise(resolve => server.close(resolve));
    await cleanupLock();
  };
  return { server, origin, close };
}
