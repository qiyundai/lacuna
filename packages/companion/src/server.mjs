import { createServer } from 'node:http';
import { readFile, stat, mkdir, open, rm } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';
import { CredentialStore } from './credentials.mjs';
import { OpenAIPlan, PlanError, createAuthorization, exchangeCode } from './openai.mjs';
import { analyzeSnapshot } from '../../worker/src/ai/pipeline.ts';
import { Vault } from './vault.mjs';
import { journalRequest, snapshot, applyAnalysis, importLegacy } from './journal.mjs';

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
  store.data.browserSessions ??= {};
  store.data.vaultSync ??= {};
  const pending = new Map(), jobs = new Map(), sessions = new Map(), vaults = new Map(), syncJobs = new Map();
  const cookieName = `lacuna_companion_${port}`;
  const sessionKey = req => {
    const value = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value) ? createHash('sha256').update(value).digest('hex') : null;
  };
  for (const [id, session] of Object.entries(store.data.browserSessions)) {
    if (session.expires > Date.now()) sessions.set(id, session); else delete store.data.browserSessions[id];
  }
  function getVault(id) {
    if (!vaults.has(id)) {
      const vault = new Vault(join(directory, 'vaults'), id);
      vault.onLock = () => jobs.get(id)?.controller.abort();
      vaults.set(id, vault);
    }
    return vaults.get(id);
  }
  async function cloud(path, token, method = 'GET', body, signal) {
    const res = await fetch(new URL(path, upstream), { method, redirect: 'error', signal: signal ?? AbortSignal.timeout(30000),
      headers: { ...(token ? { Authorization: token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new PlanError(res.status === 401 ? 'UNAUTHORIZED' : data.error?.code ?? 'HOSTED_ERROR', res.status === 401 ? 'Sign in to Lacuna again.' : data.error?.message ?? 'Could not complete the request to Lacuna. Try again.');
    }
    return res.json();
  }
  async function identity(req) {
    const session = sessions.get(sessionKey(req));
    if (!session?.auth || session.expires <= Date.now()) throw new PlanError('UNAUTHORIZED', 'Continue with ChatGPT to sign in.');
    if (!session.validatedAt || Date.now() - session.validatedAt > 60000) {
      try { await cloud('/auth/me', `Bearer ${session.auth.jwt}`); session.validatedAt = Date.now(); }
      catch (err) { if (err.code === 'UNAUTHORIZED') { getVault(session.auth.user.id).lock(); delete session.auth; } throw err; }
    }
    return { user: session.auth.user, token: `Bearer ${session.auth.jwt}` };
  }
  function syncState(id) { return store.data.vaultSync[id] ??= { enabled: false, version: 0, error: '' }; }
  async function pushSync(id, token) {
    const previous = syncJobs.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const state = syncState(id);
      if (!state.enabled) return;
      try {
        const envelope = await getVault(id).envelope();
        if (envelope.ciphertext.length > 6 * 1024 * 1024) throw new PlanError('SYNC_TOO_LARGE', 'Your local vault is saved, but it is larger than this release’s cloud-copy limit. Download an encrypted file backup instead.');
        const result = await cloud('/privacy/sync', token, 'PUT', { version: state.version, envelope });
        state.version = result.version; state.error = ''; state.lastSync = Date.now();
        await store.save();
      } catch (err) { state.error = err instanceof PlanError ? err.message : 'Cloud sync paused. Local saves are safe.'; await store.save(); throw err; }
    });
    syncJobs.set(id, next);
    try { await next; } finally { if (syncJobs.get(id) === next) syncJobs.delete(id); }
  }
  const syncLater = (id, token) => { if (syncState(id).enabled) pushSync(id, token).catch(() => {}); };
  async function runJob(userId, token, state) {
    try {
      const vault = getVault(userId), data = vault.read();
      if (!data.aiAllowed) throw new PlanError('AI_CONSENT_REQUIRED', 'Allow sharing journal context with OpenAI in privacy settings first.');
      const source = snapshot(data), generation = vault.generation;
      if (!store.data.profiles[userId]) throw new PlanError('RECONNECT', 'Continue with ChatGPT to connect your plan.');
      const models = await plan.models(userId);
      const profile = store.data.profiles[userId];
      const model = profile.model ?? models[0]?.slug;
      if (!models.some(m => m.slug === model)) throw new PlanError('MODEL_UNAVAILABLE', 'Choose an available ChatGPT model in settings.');
      const result = await analyzeSnapshot(source, async prompt => {
        state.controller.signal.throwIfAborted();
        if (!vault.unlocked || generation !== vault.generation || !vault.read().aiAllowed) throw new PlanError('VAULT_LOCKED', 'Reflection stopped because the vault locked or sharing was disabled.');
        return plan.generate(userId, model, prompt, state.controller.signal);
      });
      state.controller.signal.throwIfAborted();
      await applyAnalysis(vault, source, result);
      syncLater(userId, token);
      state.state = 'complete';
      state.code = null; state.message = '';
    } catch (err) {
      state.state = state.controller.signal.aborted ? 'idle' : 'error';
      state.code = err instanceof PlanError ? err.code : 'INFERENCE_FAILED';
      state.message = err instanceof PlanError ? err.message : 'Reflection did not complete. Your saved entries are safe. Try again.';
    } finally {
      state.running = false;
      if (state.rerun && !state.controller.signal.aborted) { state.rerun = false; queueJob(userId, token); }
    }
  }
  function queueJob(userId, token) {
    if (!getVault(userId).read().aiAllowed) throw new PlanError('AI_CONSENT_REQUIRED', 'Allow OpenAI reflections in privacy settings first.');
    const existing = jobs.get(userId);
    if (existing?.running) { existing.rerun = true; return; }
    const state = { state: 'running', running: true, rerun: false, code: null, message: '', controller: new AbortController() };
    jobs.set(userId, state);
    state.promise = runJob(userId, token, state);
  }
  function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }
  async function body(req) {
    let size = 0; const chunks = [];
    const limit = req.url === '/companion/vault/restore' ? 23 * 1024 * 1024 : 262144;
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw new PlanError('TOO_LARGE', 'Request too large'); chunks.push(chunk); }
    const value = size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlanError('BAD_REQUEST', 'Expected a JSON object.');
    return value;
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
    const nonce = randomBytes(18).toString('base64');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
    try {
      const url = new URL(req.url, origin);
      if (!allowedRequest(req, origin)) return json(res, { error: { code: 'FORBIDDEN', message: 'Open Lacuna on this computer to continue' } }, 403);
      const callback = url.pathname === '/auth/callback';
      const localApi = url.pathname.startsWith('/companion/') || url.pathname.startsWith('/api/');
      const sessionId = sessionKey(req);
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
          browserSession.auth = result;
          browserSession.expires = Date.now() + 12 * 60 * 60 * 1000;
          browserSession.validatedAt = Date.now();
          store.data.browserSessions[sessionId] = browserSession;
          await store.save();
          browserSession.error = null;
        } catch (err) { browserSession.error = err instanceof PlanError ? err.message : 'ChatGPT identity could not be verified. Connect again.'; }
        res.writeHead(303, { Location: '/' }); return res.end();
      }
      if (url.pathname.startsWith('/companion/')) {
        if (url.pathname === '/companion/session' && req.method === 'GET') {
          const result = browserSession.auth ? await identity(req) : null;
          const error = browserSession.error;
          delete browserSession.error;
          return json(res, { session: result ? { user: result.user } : null, error: error ?? null });
        }
        if (url.pathname === '/companion/connect' && req.method === 'POST') {
          const value = await body(req);
          if (value.consent !== true) throw new PlanError('CONSENT_REQUIRED', 'Acknowledge data and privacy first.');
          for (const [key, attempt] of pending) if (attempt.sessionId === sessionId || attempt.expires < Date.now()) pending.delete(key);
          const challenge = await cloud('/auth/openai/start', undefined, 'POST', { consent: true });
          const attempt = { ...createAuthorization(store.data.hostId, `${origin}/auth/callback`, store.data.registrations.signin, challenge.nonce), challenge: challenge.id, sessionId };
          pending.set(attempt.state, attempt);
          browserSession.error = null;
          return json(res, { url: attempt.url });
        }
        const { user, token } = await identity(req);
        const profile = store.data.profiles[user.id];
        const vault = getVault(user.id);
        if (url.pathname === '/companion/vault/status' && req.method === 'GET') return json(res, { exists: await vault.exists(), locked: !vault.unlocked, aiAllowed: vault.unlocked ? vault.read().aiAllowed : false, automaticAI: vault.unlocked ? vault.read().automaticAI : false, migrated: vault.unlocked ? vault.read().migrated : false, sync: syncState(user.id) });
        if (url.pathname === '/companion/vault/unlock' && req.method === 'POST') {
          const value = await body(req);
          await vault.unlock(value.passphrase, value.create === true);
          return json(res, { ok: true });
        }
        if (url.pathname === '/companion/vault/lock' && req.method === 'POST') { vault.lock(); return json(res, { ok: true }); }
        if (url.pathname === '/companion/vault/activity' && req.method === 'POST') { vault.activity(); return json(res, { ok: true }); }
        if (url.pathname === '/companion/vault/backup' && req.method === 'GET') { vault.read(); return json(res, await vault.envelope()); }
        if (url.pathname === '/companion/vault/preferences' && req.method === 'PATCH') {
          const value = await body(req);
          if (typeof value.aiAllowed !== 'boolean' || typeof value.automaticAI !== 'boolean') throw new PlanError('BAD_REQUEST', 'Invalid privacy preferences.');
          if (!value.aiAllowed) jobs.get(user.id)?.controller.abort();
          await vault.update(d => { d.aiAllowed = value.aiAllowed; d.automaticAI = value.aiAllowed && value.automaticAI; });
          syncLater(user.id, token); return json(res, { ok: true });
        }
        if (url.pathname === '/companion/vault/legacy' && req.method === 'GET') return json(res, await cloud('/privacy/status', token));
        if (url.pathname === '/companion/vault/migrate' && req.method === 'POST') {
          vault.read();
          const legacy = await cloud('/privacy/legacy', token);
          if (!legacy.migrated) {
            await importLegacy(vault, legacy);
            await cloud('/privacy/migrate', token, 'POST', { version: legacy.version });
          }
          await vault.update(d => { d.migrated = true; });
          syncLater(user.id, token); vault.lock(); return json(res, { ok: true });
        }
        if (url.pathname === '/companion/vault/sync' && req.method === 'POST') {
          vault.read(); const value = await body(req), state = syncState(user.id);
          if (value.enabled !== true) { state.enabled = false; await syncJobs.get(user.id)?.catch(() => {}); await store.save(); return json(res, { ok: true }); }
          state.enabled = true; await store.save(); await pushSync(user.id, token); return json(res, { ok: true });
        }
        if (url.pathname === '/companion/vault/sync' && req.method === 'DELETE') {
          const state = syncState(user.id); state.enabled = false; await syncJobs.get(user.id)?.catch(() => {});
          await cloud('/privacy/sync', token, 'DELETE'); const remote = await cloud('/privacy/sync', token);
          state.version = remote.version; state.error = ''; await store.save(); return json(res, { ok: true });
        }
        if (url.pathname === '/companion/vault/restore' && req.method === 'POST') {
          const value = await body(req), state = syncState(user.id);
          state.enabled = false; await syncJobs.get(user.id)?.catch(() => {});
          await store.save();
          const remote = value.envelope ? { envelope: value.envelope, version: 0 } : await cloud('/privacy/sync', token);
          if (!remote.envelope) throw new PlanError('NO_CLOUD_COPY', 'No encrypted cloud copy exists for this account.');
          await vault.restore(remote.envelope, value.passphrase);
          state.version = remote.version; state.error = ''; await store.save(); return json(res, { ok: true });
        }
        if (url.pathname === '/companion/status' && req.method === 'GET') {
          const state = jobs.get(user.id);
          return json(res, { connected: !!profile, planEnabled: !!profile?.scopes?.includes('chatgpt.tokens.use.direct') && !!profile?.scopes?.includes('resource.invoke'), email: profile?.email ?? null, model: profile?.model ?? null,
            state: state?.state ?? 'idle', code: state?.code ?? null, message: state?.message ?? '' });
        }
        if (url.pathname === '/companion/disconnect' && req.method === 'POST') {
          for (const [key, attempt] of pending) if (attempt.sessionId === sessionId) pending.delete(key);
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
        const { user, token } = await identity(req), vault = getVault(user.id);
        if (path === '/auth/logout' && req.method === 'POST') {
          vault.lock();
          const results = await Promise.allSettled([cloud('/auth/logout', token, 'POST'), plan.disconnect(user.id)]);
          const revoked = results[0].status === 'fulfilled', openaiRevoked = results[1].status === 'fulfilled' && results[1].value === true;
          delete store.data.browserSessions[sessionId]; sessions.delete(sessionId); await store.save();
          res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
          return json(res, { ok: true, revoked, openaiRevoked });
        }
        if (path === '/auth/account' && req.method === 'DELETE') {
          syncState(user.id).enabled = false; await syncJobs.get(user.id)?.catch(() => {});
          jobs.get(user.id)?.controller.abort(); await jobs.get(user.id)?.promise;
          await plan.disconnect(user.id);
          await cloud('/auth/account', token, 'DELETE');
          await vault.remove();
          for (const [key, session] of sessions) if (session.auth?.user.id === user.id) { sessions.delete(key); delete store.data.browserSessions[key]; }
          delete store.data.vaultSync[user.id]; await store.save(); return json(res, { ok: true });
        }
        if (path === '/ai/refresh' && req.method === 'POST') {
          queueJob(user.id, token); return json(res, { ok: true }, 202);
        }
        const payload = ['GET', 'HEAD'].includes(req.method) ? undefined : await body(req);
        if (path.startsWith('/entries/') && req.method === 'DELETE') jobs.get(user.id)?.controller.abort();
        const result = await journalRequest(vault, path, req.method, payload, url);
        json(res, result);
        if (!['GET', 'HEAD'].includes(req.method)) syncLater(user.id, token);
        if (req.method === 'POST' && path === '/entries' && vault.read().aiAllowed && vault.read().automaticAI) queueJob(user.id, token);
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
        data = Buffer.from(data.toString().replace('<head>', '<head><meta name="lacuna-companion" content="1">').replace(/<script\b/g, `<script nonce="${nonce}"`));
        if (!browserSession) {
          if (sessions.size >= 200) sessions.delete(sessions.keys().next().value);
          const id = randomBytes(32).toString('hex'); sessions.set(createHash('sha256').update(id).digest('hex'), {});
          res.setHeader('Set-Cookie', `${cookieName}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
        }
      }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (err) {
      if (res.writableEnded) return;
      const status = err?.code === 'UNAUTHORIZED' ? 401 : err?.code === 'VAULT_LOCKED' ? 423 : err?.code === 'NOT_FOUND' ? 404 : err?.code?.includes('CONFLICT') ? 409 : err instanceof PlanError || err instanceof SyntaxError ? 400 : 502;
      json(res, { error: { code: err instanceof PlanError ? err.code : 'COMPANION_ERROR', message: err instanceof PlanError ? err.message : 'The companion could not complete the request. Try again.' } }, status);
    }
  });
  server.requestTimeout = 35000;
  server.headersTimeout = 15000;
  const lockTimer = setInterval(() => { for (const vault of vaults.values()) void vault.unlocked; }, 1000);
  lockTimer.unref();
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); } catch (err) { await cleanupLock(); throw err; }
  const close = async () => {
    clearInterval(lockTimer);
    for (const vault of vaults.values()) vault.lock();
    for (const state of jobs.values()) state.controller?.abort();
    await Promise.allSettled([...jobs.values()].map(state => state.promise));
    await Promise.allSettled([...syncJobs.values()]);
    await new Promise(resolve => server.close(resolve));
    await cleanupLock();
  };
  return { server, origin, close };
}
