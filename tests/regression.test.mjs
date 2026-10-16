import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { SignJWT, generateKeyPair, createLocalJWKSet, exportJWK } from 'jose';
import app from '../packages/worker/src/index.ts';
import { verifyOpenAIIdentity } from '../packages/worker/src/openai-identity.ts';
import { upsertUser, createEntry, getAllEntriesForUser, deleteEntry } from '../packages/worker/src/db.ts';
import { acquireSnapshot, commitAnalysis, releaseAnalysis } from '../packages/worker/src/ai/storage.ts';
import { analyzeSnapshot, validResult } from '../packages/worker/src/ai/pipeline.ts';
import { mergeConceptsIntoGraph } from '../packages/worker/src/ai/graph.ts';
import { validWeights } from '../packages/worker/src/ai/validation.ts';
import { createAuthorization, exchangeCode, consumeResponse, OpenAIPlan } from '../packages/companion/src/openai.mjs';
import { allowedRequest, startCompanion } from '../packages/companion/src/server.mjs';
import { CredentialStore } from '../packages/companion/src/credentials.mjs';
import { holdDetector, swipeDetector } from '../packages/frontend/src/lib/gesture.ts';
import { session, setAuthed, signOut } from '../packages/frontend/src/lib/stores/session.svelte.ts';
import { entriesStore, loadEntries } from '../packages/frontend/src/lib/stores/entries.svelte.ts';
import { draft, insertAt, deleteRange, clearDraft } from '../packages/frontend/src/lib/stores/draft.svelte.ts';

// Execute the real migration SQL and route queries against SQLite, with D1's transactional batch contract.
class D1 {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.sqlite.exec('PRAGMA foreign_keys = ON'); }
  prepare(sql) {
    const db = this;
    return { args: [], bind(...args) { this.args = args; return this; },
      async first() { return db.sqlite.prepare(sql).get(...this.args) ?? null; },
      async all() { return { results: db.sqlite.prepare(sql).all(...this.args) }; },
      async run() { const meta = db.sqlite.prepare(sql).run(...this.args); return { meta: { changes: Number(meta.changes) } }; } };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sqlite.exec('COMMIT'); return results; }
    catch (err) { this.sqlite.exec('ROLLBACK'); throw err; }
  }
}
async function fixture(t) {
  const DB = new D1(); t.after(() => DB.sqlite.close());
  for (const file of (await readdir('packages/worker/migrations')).sort()) DB.sqlite.exec(await readFile(`packages/worker/migrations/${file}`, 'utf8'));
  const user = await upsertUser(DB, 'one@example.com');
  const env = { DB, JWT_SECRET: 'test-secret-only', FRONTEND_ORIGIN: 'https://lacuna.example',  };
  const jwt = await new SignJWT({ sub: user.id, email: user.email }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(env.JWT_SECRET));
  const work = [];
  const request = (path, method = 'GET', value, authorization = jwt) => app.request(`https://api.example${path}`, { method,
    headers: { Authorization: `Bearer ${authorization}`, 'Content-Type': 'application/json' }, body: value === undefined ? undefined : typeof value === 'string' ? value : JSON.stringify(value) }, env, { waitUntil(promise) { work.push(promise); } });
  t.after(() => Promise.allSettled(work));
  return { DB, user, env, jwt, request };
}
const emptyResult = { weights: {}, graph: { nodes: [], processed_count: 0 }, summaries: [], extracted: 0, memoir: null, memoirCount: 0 };

test('malformed JSON, non-string bodies and invalid page sizes return 400', async t => {
  const f = await fixture(t);
  for (const value of ['{', 'null', { body: 5 }, { body: [] }, { body: 'hello', solidified_at: 'yesterday' }, { body: 'x'.repeat(501) }]) assert.equal((await f.request('/entries', 'POST', value)).status, 400);
  for (const limit of ['0', '-1', 'NaN', '1.5']) assert.equal((await f.request(`/entries?limit=${limit}`)).status, 400);
  assert.equal((await f.request('/patterns', 'PATCH', { model_weights: { story_thread: 2 } })).status, 400);
  assert.equal((await f.request('/patterns', 'PATCH', { model_weights: [] })).status, 400);
});
test('email links are retired and ChatGPT challenges require consent and expire', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/auth/request', 'POST', { email: 'test@example.com', consent: true })).status, 410);
  assert.equal((await f.request('/auth/verify?token=old-link')).status, 410);
  assert.equal((await f.request('/auth/openai/start', 'POST', {})).status, 400);
  const challenge = await (await f.request('/auth/openai/start', 'POST', { consent: true })).json();
  assert.ok(challenge.nonce);
  assert.equal((await f.request('/auth/openai/complete', 'POST', { challenge: challenge.id, clientId: 'issued', idToken: 'forged' })).status, 401);
  await f.DB.prepare('UPDATE openai_login_challenges SET expires_at = unixepoch()').run();
  assert.equal((await f.request('/auth/openai/complete', 'POST', { challenge: challenge.id, clientId: 'issued', idToken: 'forged' })).status, 401);
  assert.equal((await f.request('/ai/provider', 'PATCH', { provider: 'anthropic' })).status, 400);
  assert.equal((await f.request('/ai/refresh', 'POST')).status, 409);
});
test('deleted accounts lose access with previously valid JWTs', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/auth/account', 'DELETE')).status, 200);
  assert.equal((await f.request('/entries')).status, 401);
});
test('downstream database errors stay server errors instead of becoming invalid-token responses', async t => {
  const f = await fixture(t);
  f.DB.sqlite.exec('DROP TABLE entries');
  assert.equal((await f.request('/entries')).status, 500);
});
test('pagination keeps same-second entries and isolates account cursors', async t => {
  const f = await fixture(t);
  const other = await upsertUser(f.DB, 'two@example.com');
  for (let i = 0; i < 5; i++) await createEntry(f.DB, f.user.id, `entry ${i}`, 123);
  const foreign = await createEntry(f.DB, other.id, 'private', 123);
  const seen = []; let cursor;
  do { const page = await (await f.request(`/entries?limit=2${cursor ? `&cursor=${cursor}` : ''}`)).json(); seen.push(...page.entries); cursor = page.nextCursor; } while (cursor);
  assert.equal(new Set(seen.map(e => e.id)).size, 5);
  assert.equal((await (await f.request(`/entries?cursor=${foreign.id}`)).json()).entries.length, 0);
  assert.equal((await f.request(`/entries/${foreign.id}`, 'DELETE')).status, 404);
});
test('analysis reads entries in insertion order even with random IDs in the same second', async t => {
  const f = await fixture(t);
  await f.DB.prepare('INSERT INTO entries (id, user_id, body) VALUES (?, ?, ?)').bind('zz', f.user.id, 'first').run();
  await f.DB.prepare('INSERT INTO entries (id, user_id, body) VALUES (?, ?, ?)').bind('aa', f.user.id, 'second').run();
  assert.deepEqual((await getAllEntriesForUser(f.DB, f.user.id)).map(e => e.body), ['first', 'second']);
});
test('entry deletion clears derived content and rejects in-flight analysis', async t => {
  const f = await fixture(t);
  const entry = await createEntry(f.DB, f.user.id, 'private reflection', 123);
  const job = await acquireSnapshot(f.DB, f.user.id, 'chatgpt');
  await f.DB.prepare('INSERT INTO memoir_snapshots (user_id, prose) VALUES (?, ?)').bind(f.user.id, 'derived private reflection').run();
  assert.equal(await deleteEntry(f.DB, f.user.id, entry.id), true);
  assert.equal(await commitAnalysis(f.DB, f.user.id, job.lease, job.snapshot.version, 'chatgpt', emptyResult), false);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM memoir_snapshots').get().n, 0);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM patterns').get().n, 0);
});
test('analysis leases serialize workers and reject old data after a version change', async t => {
  const f = await fixture(t);
  const job = await acquireSnapshot(f.DB, f.user.id, 'chatgpt');
  assert.equal(await acquireSnapshot(f.DB, f.user.id, 'chatgpt'), null);
  await f.DB.prepare('UPDATE users SET entries_version = entries_version + 1 WHERE id = ?').bind(f.user.id).run();
  assert.equal(await commitAnalysis(f.DB, f.user.id, job.lease, job.snapshot.version, 'chatgpt', emptyResult), false);
  await releaseAnalysis(f.DB, f.user.id, job.lease);
  assert.ok(await acquireSnapshot(f.DB, f.user.id, 'chatgpt'));
});
test('successful AI writes commit together and track extraction backlog', async t => {
  const f = await fixture(t);
  await createEntry(f.DB, f.user.id, 'one', 123);
  const job = await acquireSnapshot(f.DB, f.user.id, 'chatgpt');
  assert.equal(await commitAnalysis(f.DB, f.user.id, job.lease, job.snapshot.version, 'chatgpt', emptyResult), true);
  assert.equal((await (await f.request('/ai/status')).json()).pending, 1);
  const result = { ...emptyResult, extracted: 1, graph: { nodes: [], processed_count: 1 } };
  assert.equal(await commitAnalysis(f.DB, f.user.id, job.lease, job.snapshot.version, 'chatgpt', result), true);
  assert.equal((await (await f.request('/ai/status')).json()).pending, 0);
});
test('new entries invalidate an analysis snapshot', async t => {
  const f = await fixture(t);
  const job = await acquireSnapshot(f.DB, f.user.id, 'chatgpt');
  await createEntry(f.DB, f.user.id, 'new', 123);
  assert.equal(await commitAnalysis(f.DB, f.user.id, job.lease, job.snapshot.version, 'chatgpt', emptyResult), false);
});
test('entry retries are idempotent and cannot reuse another account’s entry ID', async t => {
  const f = await fixture(t);
  const entry_id = 'a'.repeat(32);
  for (let i = 0; i < 2; i++) assert.equal((await f.request('/entries', 'POST', { body: 'one thought', entry_id })).status, 201);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM entries').get().n, 1);
  assert.equal((await f.request('/entries', 'POST', { body: 'different thought', entry_id })).status, 409);
});
test('AI output validates weights and concept shapes, and preserves input graph', () => {
  const graph = { nodes: [{ concept: 'work', type: 'theme', weight: .2, count: 1 }], processed_count: 1 };
  const result = mergeConceptsIntoGraph(graph, { themes: ['Work', 'work'], emotions: ['work'], entities: [] });
  assert.equal(graph.nodes[0].count, 1);
  assert.equal(result.nodes.find(n => n.type === 'theme').count, 2);
  assert.equal(result.nodes.length, 2);
  assert.equal(validWeights({ story_thread: Infinity }), false);
  assert.equal(validWeights({ story_thread: -.1 }), false);
  assert.equal(validResult(emptyResult), true);
  assert.equal(validResult({ ...emptyResult, graph: { nodes: [], processed_count: 4 } }), false);
});
test('failed extraction never advances checkpoints', async () => {
  const snapshot = { version: 0, entries: [{ body: 'hello' }], weights: {}, graph: { nodes: [], processed_count: 0 }, summaries: [], memoir: null, memoirCount: 0, extracted: 0 };
  await assert.rejects(analyzeSnapshot(snapshot, async () => '{"themes":1}'), /Invalid concept/);
  assert.equal(snapshot.graph.processed_count, 0);
  assert.equal(snapshot.extracted, 0);
});
test('failed memoir generation leaves its checkpoint unchanged', async () => {
  const snapshot = { version: 0, entries: Array.from({ length: 20 }, () => ({ body: 'hello' })), weights: {}, graph: { nodes: [], processed_count: 20 }, summaries: [], memoir: null, memoirCount: 0, extracted: 20 };
  let calls = 0;
  await assert.rejects(analyzeSnapshot(snapshot, async () => { if (calls++ === 0) return '{"weights":{"story_thread":0.5},"summaries":{},"overall_tone":"quiet"}'; throw new Error('offline'); }), /offline/);
  assert.equal(snapshot.memoirCount, 0);
});
function sse(events, split = false) {
  const text = events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join('');
  return new Response(new ReadableStream({ start(controller) { if (split) for (const char of text) controller.enqueue(new TextEncoder().encode(char)); else controller.enqueue(new TextEncoder().encode(text)); controller.close(); } }));
}
test('SSE parser handles fragmented CRLF and requires terminal success', async () => {
  assert.equal(await consumeResponse(sse([{ type: 'response.output_text.delta', delta: 'hello' }, { type: 'response.completed', response: { status: 'completed' } }], true)), 'hello');
  await assert.rejects(consumeResponse(sse([{ type: 'response.output_text.delta', delta: 'partial' }])), /did not complete/);
  await assert.rejects(consumeResponse(sse([{ type: 'response.incomplete' }])), /did not complete/);
  await assert.rejects(consumeResponse(sse([{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }])), error => error.code === 'USAGE_LIMIT');
});
test('Responses requests use only supported plan fields and bearer OAuth', async () => {
  let request;
  const store = { data: { profiles: { user: { access_token: 'oauth-token', scopes: ['resource.invoke', 'chatgpt.tokens.use.direct'], expiresAt: Date.now() + 3600000 } } } };
  const plan = new OpenAIPlan(store, async (url, options) => { request = { url, ...options }; return sse([{ type: 'response.output_text.delta', delta: 'hello' }, { type: 'response.completed' }]); });
  assert.equal(await plan.generate('user', 'available-model', { system: 'witness', user: 'hello' }), 'hello');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.headers.Authorization, 'Bearer oauth-token');
  assert.deepEqual(JSON.parse(request.body), { model: 'available-model', instructions: 'witness', input: [{ role: 'user', content: 'hello' }], store: false, stream: true });
});
test('parallel refresh requests rotate the credential set exactly once', async () => {
  let calls = 0, saves = 0;
  const store = { data: { profiles: { user: { access_token: 'old', refresh_token: 'old-refresh', client_id: 'issued', expiresAt: 0, scopes: ['resource.invoke', 'chatgpt.tokens.use.direct'] } } }, async save() { saves++; } };
  const plan = new OpenAIPlan(store, async (_url, options) => { calls++; assert.equal(options.body.get('client_id'), 'issued'); assert.equal(options.body.has('scope'), false); await new Promise(r => setTimeout(r, 5)); return Response.json({ access_token: 'new', refresh_token: 'new-refresh', token_type: 'Bearer', expires_in: 3600 }); });
  assert.deepEqual(await Promise.all([plan.access('user'), plan.access('user')]), ['new', 'new']);
  assert.equal(calls, 1); assert.equal(saves, 1); assert.equal(store.data.profiles.user.refresh_token, 'new-refresh');
});
test('OAuth registration uses PKCE, stable host ID and the issued callback client ID', async () => {
  const attempt = createAuthorization('urn:uuid:host', 'http://127.0.0.1:1455/auth/callback');
  const url = new URL(attempt.url);
  assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(url.searchParams.get('ext_agent_host_id'), 'urn:uuid:host');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const keys = await generateKeyPair('RS256');
  const publicKey = await exportJWK(keys.publicKey); publicKey.kid = 'test';
  const idToken = await new SignJWT({ nonce: attempt.nonce, email: 'plan@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject('account').setIssuer('https://auth.openai.com').setAudience('issued-client').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
  const fetchImpl = async (_url, options) => { assert.equal(options.body.get('client_id'), 'issued-client'); assert.equal(options.body.get('redirect_uri'), attempt.redirectUri); return Response.json({ access_token: 'secret', token_type: 'Bearer', expires_in: 3600, id_token: idToken, scope: 'resource.invoke chatgpt.tokens.use.direct' }); };
  const params = new URLSearchParams({ state: attempt.state, code: 'code', client_id: 'issued-client' });
  const profile = await exchangeCode(attempt, params, { fetchImpl, keySet: createLocalJWKSet({ keys: [publicKey] }) });
  assert.equal(profile.subject, 'account'); assert.equal(profile.client_id, 'issued-client');
  const identityOnly = await exchangeCode(attempt, params, { keySet: createLocalJWKSet({ keys: [publicKey] }), fetchImpl: async (...args) => {
    const value = await (await fetchImpl(...args)).json(); return Response.json({ ...value, scope: 'openid profile email' });
  } });
  assert.equal(identityOnly.subject, 'account');
  await assert.rejects(new OpenAIPlan({ data: { profiles: { user: identityOnly } } }).access('user'), error => error.code === 'PLAN_DISABLED');
  await assert.rejects(exchangeCode(attempt, new URLSearchParams({ state: 'wrong' })), error => error.code === 'INVALID_CALLBACK');
  await assert.rejects(exchangeCode(attempt, new URLSearchParams({ state: attempt.state, error: 'access_denied' })), error => error.code === 'CONSENT_DECLINED');
  await assert.rejects(exchangeCode({ ...attempt, subject: 'different-account' }, params, { fetchImpl, keySet: createLocalJWKSet({ keys: [publicKey] }) }), error => error.code === 'INVALID_IDENTITY');
});
test('companion rejects cross-origin writes and DNS rebinding hostnames', () => {
  const origin = 'http://127.0.0.1:1455';
  assert.equal(allowedRequest({ method: 'POST', url: '/companion/connect', headers: { host: '127.0.0.1:1455', origin } }, origin), true);
  assert.equal(allowedRequest({ method: 'POST', url: '/companion/connect', headers: { host: '127.0.0.1:1455', origin: 'https://evil.example' } }, origin), false);
  assert.equal(allowedRequest({ method: 'GET', url: '/', headers: { host: 'evil.example:1455' } }, origin), false);
});
test('protected credential storage persists stable host ID and serialized writes', async () => {
  const dir = await mkdtemp(resolve('.test-output/credentials-'));
  try {
    const store = await new CredentialStore(dir).load();
    store.data.profiles.user = { access_token: 'private-test-token' };
    await Promise.all([store.save(), store.save()]);
    const again = await new CredentialStore(dir).load();
    assert.equal(again.data.hostId, store.data.hostId);
    assert.equal(again.data.profiles.user.access_token, 'private-test-token');
    if (process.platform === 'win32') assert.equal((await readFile(resolve(dir, 'chatgpt.credentials'), 'utf8')).includes('private-test-token'), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('disconnect clears tokens and retains public identity registration even when revocation fails', async () => {
  const registration = { client_id: 'issued', subject: 'person', id_token: 'private-id' };
  const store = { data: { profiles: { user: { refresh_token: 'secret', client_id: 'issued' } }, registrations: { user: registration, signin: registration } }, async save() {} };
  const plan = new OpenAIPlan(store, async () => { throw new Error('offline'); });
  assert.equal(await plan.disconnect('user'), false);
  assert.equal(store.data.profiles.user, undefined);
  assert.deepEqual(store.data.registrations.user, { client_id: 'issued', subject: 'person' });
  assert.deepEqual(store.data.registrations.signin, { client_id: 'issued', subject: 'person' });
});

test('sign-out clears private state and late responses cannot populate the next account', async t => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });
  setAuthed({ id: 'old', email: 'old@example.com' });
  insertAt(0, 'private draft');
  let finish;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  const loading = loadEntries();
  signOut();
  assert.equal(draft.text, '');
  assert.equal(session.user, null);
  setAuthed({ id: 'new', email: 'new@example.com' });
  finish(Response.json({ entries: [{ id: 'private-old-entry' }], nextCursor: null }));
  await loading;
  assert.deepEqual(entriesStore.entries, []);
  assert.equal(session.user.id, 'new');
  signOut();
});
test('draft edits use textarea UTF-16 positions without corrupting emoji', () => {
  clearDraft(); insertAt(0, '🙂a'); deleteRange(2, 3); insertAt(2, 'b');
  assert.equal(draft.text, '🙂b');
  assert.equal(draft.chars.length, 2);
  clearDraft();
});
test('slow pointer movement cancels a hold based on total distance and destroy removes timers', async t => {
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => { globalThis.window = originalWindow; });
  class Node extends EventTarget { closest() { return null; } }
  const node = new Node(); let saved = 0;
  const action = holdDetector(node, { durationMs: 20, onHold: () => saved++ });
  function pointer(type, x) {
    const event = new Event(type);
    Object.assign(event, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: 0, movementX: 2, movementY: 0 });
    node.dispatchEvent(event);
  }
  pointer('pointerdown', 0); pointer('pointermove', 3); pointer('pointermove', 6); pointer('pointermove', 9);
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(saved, 0);
  pointer('pointerdown', 0); action.destroy();
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(saved, 0);
});

test('companion serves the app, proxies authenticated entries, and completes local analysis into the hosted account', async t => {
  const f = await fixture(t);
  await f.request('/ai/provider', 'PATCH', { provider: 'chatgpt' });
  const cloud = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const response = await app.request(`https://api.example${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }, f.env, { waitUntil() {} });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(resolve => cloud.listen(0, '127.0.0.1', resolve));
  const unused = createServer(); await new Promise(resolve => unused.listen(0, '127.0.0.1', resolve)); const port = unused.address().port; await new Promise(resolve => unused.close(resolve));
  const directory = await mkdtemp(resolve('.test-output/companion-'));
  await writeFile(resolve(directory, 'index.html'), '<html><head></head><body>Lacuna</body></html>');
  const store = { data: { hostId: 'urn:uuid:host', registrations: {}, profiles: { [f.user.id]: { access_token: 'never-expose-this', email: 'plan@example.com' } } }, async save() {} };
  const plan = { async models() { return [{ slug: 'test-model', name: 'Test model' }]; }, async generate(_id, _model, prompt) { return prompt.system.includes('extract') ? '{"themes":["home"],"emotions":[],"entities":[]}' : '{"acknowledgment":"Held."}'; } };
  const companion = await startCompanion({ port, dataDir: directory, buildDir: directory, apiUrl: `http://127.0.0.1:${cloud.address().port}`, store, plan });
  try {
    const home = await fetch(companion.origin);
    assert.match(await home.text(), /lacuna-companion/);
    const cookie = home.headers.get('set-cookie').split(';')[0];
    const headers = { Cookie: cookie, Origin: companion.origin, Authorization: `Bearer ${f.jwt}`, 'Content-Type': 'application/json' };
    const denied = await fetch(`${companion.origin}/companion/connect`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' } });
    assert.equal(denied.status, 403);
    const created = await fetch(`${companion.origin}/api/entries`, { method: 'POST', headers, body: JSON.stringify({ body: 'home is quiet', solidified_at: 123 }) });
    assert.equal(created.status, 201);
    let status;
    for (let i = 0; i < 50; i++) {
      status = await (await fetch(`${companion.origin}/companion/status`, { headers })).json();
      if (status.state === 'complete' || status.state === 'error') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(status.state, 'complete', JSON.stringify(status));
    assert.equal(JSON.stringify(status).includes('never-expose-this'), false);
    const patterns = await (await f.request('/patterns')).json();
    assert.equal(patterns.model_weights.acknowledgment, 'Held.');
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM entries').get().n, 1);
  } finally { await companion.close(); await new Promise(resolve => cloud.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});

test('ChatGPT sign-in verifies identity, isolates browsers, rejects replay and preserves account identity', async t => {
  const f = await fixture(t);
  const keys = await generateKeyPair('RS256');
  const publicKey = await exportJWK(keys.publicKey); publicKey.kid = 'auth-flow';
  const keySet = createLocalJWKSet({ keys: [publicKey] });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => String(url) === 'https://auth.openai.com/.well-known/jwks.json'
    ? Promise.resolve(Response.json({ keys: [publicKey] })) : originalFetch(url, options);
  t.after(() => { globalThis.fetch = originalFetch; });
  async function idToken(nonce, subject = 'chatgpt-person', issuer = 'https://auth.openai.com') {
    return new SignJWT({ nonce, email: f.user.email }).setProtectedHeader({ alg: 'RS256', kid: 'auth-flow' })
      .setIssuer(issuer).setAudience('issued-client').setSubject(subject).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
  }
  const valid = await idToken('nonce');
  assert.equal((await verifyOpenAIIdentity(valid, 'issued-client', 'nonce', keySet)).subject, 'chatgpt-person');
  await assert.rejects(verifyOpenAIIdentity(valid, 'wrong-client', 'nonce', keySet));
  await assert.rejects(verifyOpenAIIdentity(valid, 'issued-client', 'wrong-nonce', keySet));
  await assert.rejects(verifyOpenAIIdentity(await idToken('nonce', 'person', 'https://evil.example'), 'issued-client', 'nonce', keySet));
  const cloud = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const response = await app.request(`https://api.example${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }, f.env, { waitUntil() {} });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(resolve => cloud.listen(0, '127.0.0.1', resolve));
  const unused = createServer(); await new Promise(resolve => unused.listen(0, '127.0.0.1', resolve)); const port = unused.address().port; await new Promise(resolve => unused.close(resolve));
  const directory = await mkdtemp(resolve('.test-output/signin-'));
  await writeFile(resolve(directory, 'index.html'), '<html><head></head><body>Lacuna</body></html>');
  const store = { data: { hostId: 'urn:uuid:test-host', profiles: {}, registrations: {} }, async save() {} };
  let lastAttempt, lastToken;
  const companion = await startCompanion({ port, dataDir: directory, buildDir: directory, apiUrl: `http://127.0.0.1:${cloud.address().port}`, store,
    async exchangeCode(attempt) {
      lastAttempt = attempt; lastToken = await idToken(attempt.nonce);
      return { client_id: 'issued-client', subject: 'chatgpt-person', email: f.user.email, id_token: lastToken, access_token: 'private-access', refresh_token: 'private-refresh', scopes: ['resource.invoke', 'chatgpt.tokens.use.direct'], expiresAt: Date.now() + 3600000 };
    }, plan: { async models() { return [{ slug: 'model', name: 'Model' }]; }, async generate(_id, _model, prompt) { assert.equal(prompt.user, 'Confirm this connection.'); return 'Lacuna is connected.'; } },
  });
  try {
    const home = await fetch(companion.origin), otherHome = await fetch(companion.origin);
    const cookie = home.headers.get('set-cookie').split(';')[0], otherCookie = otherHome.headers.get('set-cookie').split(';')[0];
    assert.notEqual(cookie, otherCookie);
    const headers = { Cookie: cookie, Origin: companion.origin, 'Content-Type': 'application/json' };
    const attempt = await (await fetch(`${companion.origin}/companion/connect`, { method: 'POST', headers, body: JSON.stringify({ consent: true }) })).json();
    const state = new URL(attempt.url).searchParams.get('state');
    const callback = `${companion.origin}/auth/callback?state=${state}&client_id=issued-client&code=test`;
    assert.equal((await fetch(callback, { headers: { Cookie: otherCookie }, redirect: 'manual' })).status, 502);
    assert.equal((await fetch(callback, { headers, redirect: 'manual' })).status, 303);
    assert.equal((await (await fetch(`${companion.origin}/companion/session`, { headers: { Cookie: otherCookie } })).json()).session, null);
    const result = await (await fetch(`${companion.origin}/companion/session`, { headers })).json();
    assert.ok(result.session?.jwt, JSON.stringify(result));
    const user = result.session.user;
    assert.notEqual(user.id, f.user.id, 'matching emails must never claim an existing account');
    assert.equal((await f.request('/auth/me', 'GET', undefined, result.session.jwt)).status, 200);
    assert.equal(JSON.stringify(result).includes('private-access'), false);
    assert.equal(JSON.stringify(result).includes(lastToken), false);
    assert.equal((await (await fetch(`${companion.origin}/companion/session`, { headers })).json()).session, null);
    assert.equal((await f.request('/auth/openai/complete', 'POST', { challenge: lastAttempt.challenge, clientId: 'issued-client', idToken: lastToken })).status, 401);
    const second = await (await f.request('/auth/openai/start', 'POST', { consent: true })).json();
    assert.equal((await f.request('/auth/openai/complete', 'POST', { challenge: second.id, clientId: 'issued-client', idToken: lastToken })).status, 401);
    const signed = await idToken(second.nonce);
    const responses = await Promise.all([1, 2].map(() => f.request('/auth/openai/complete', 'POST', { challenge: second.id, clientId: 'issued-client', idToken: signed })));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
    assert.equal((await responses.find(r => r.status === 200).json()).user.id, user.id);
    const tested = await fetch(`${companion.origin}/companion/test`, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${result.session.jwt}` } });
    assert.deepEqual(await tested.json(), { ok: true, text: 'Lacuna is connected.' });
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM entries').get().n, 0);
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM openai_identities').get().n, 1);
    assert.equal((await f.request('/auth/account', 'DELETE', undefined, result.session.jwt)).status, 200);
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM openai_identities').get().n, 0);
  } finally { await companion.close(); await new Promise(resolve => cloud.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
