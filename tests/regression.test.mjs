import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './database.mjs';
import { readFile, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
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
import { storyStore, loadStory } from '../packages/frontend/src/lib/stores/story.svelte.ts';
import { archiveMarkdown, groupThoughts } from '../packages/frontend/src/lib/story.ts';
import { Vault, LOCK_AFTER_MS } from '../packages/companion/src/vault.mjs';
import { journalRequest, snapshot, applyAnalysis, importLegacy } from '../packages/companion/src/journal.mjs';
import { initWeather, weather } from '../packages/frontend/src/lib/stores/weather.svelte.ts';

async function fixture(t) {
  const DB = await createTestDatabase(); t.after(() => DB.sqlite.close());
  const user = await upsertUser(DB, 'one@example.com');
  const env = { DB, JWT_SECRET: 'test-secret-only', FRONTEND_ORIGIN: 'https://lacuna.example',  };
  const sessionId = crypto.randomUUID();
  await DB.prepare('INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?, ?, unixepoch() + 3600)').bind(sessionId, user.id).run();
  const jwt = await new SignJWT({ sub: user.id, email: user.email }).setJti(sessionId).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(env.JWT_SECRET));
  const work = [];
  const request = (path, method = 'GET', value, authorization = jwt) => app.request(`https://api.example${path}`, { method,
    headers: { Authorization: `Bearer ${authorization}`, 'Content-Type': 'application/json' }, body: value === undefined ? undefined : typeof value === 'string' ? value : JSON.stringify(value) }, env, { waitUntil(promise) { work.push(promise); } });
  t.after(() => Promise.allSettled(work));
  return { DB, user, env, jwt, request };
}
const emptyResult = { weights: {}, graph: { nodes: [], processed_count: 0 }, summaries: [], extracted: 0, memoir: null, memoirCount: 0 };

test('hosted API refuses new plaintext journal writes from old clients', async t => {
  const f = await fixture(t);
  for (const value of ['{', 'null', { body: 5 }, { body: [] }, { body: 'hello', solidified_at: 'yesterday' }, { body: 'x'.repeat(501) }]) assert.equal((await f.request('/entries', 'POST', value)).status, 410);
  for (const limit of ['0', '-1', 'NaN', '1.5']) assert.equal((await f.request(`/entries?limit=${limit}`)).status, 400);
  assert.equal((await f.request('/patterns', 'PATCH', { model_weights: { story_thread: .2 } })).status, 410);
  assert.equal((await f.request('/ai/context', 'POST')).status, 410);
  assert.equal((await f.request('/ai/results', 'POST', emptyResult)).status, 410);
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
  assert.equal((await f.request('/ai/provider', 'PATCH', { provider: 'anthropic' })).status, 410);
  assert.equal((await f.request('/ai/refresh', 'POST')).status, 410);
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
  for (let i = 0; i < 2; i++) assert.equal((await createEntry(f.DB, f.user.id, 'one thought', 123, entry_id)).id, entry_id);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM entries').get().n, 1);
  await assert.rejects(createEntry(f.DB, f.user.id, 'different thought', 123, entry_id));
  const other = await upsertUser(f.DB, 'another@example.test');
  await assert.rejects(createEntry(f.DB, other.id, 'one thought', 123, entry_id));
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
  const finishEntries = finish;
  storyStore.data = { summary: { total: 4 }, graph: { nodes: [{ concept: 'private theme' }] } };
  const loadingStory = loadStory();
  const finishStory = finish;
  signOut();
  assert.equal(draft.text, '');
  assert.equal(session.user, null);
  assert.equal(storyStore.data, null);
  setAuthed({ id: 'new', email: 'new@example.com' });
  finishEntries(Response.json({ entries: [{ id: 'private-old-entry' }], nextCursor: null }));
  finishStory(Response.json({ summary: { total: 4 }, graph: { nodes: [{ concept: 'private theme' }] } }));
  await Promise.all([loading, loadingStory]);
  assert.deepEqual(entriesStore.entries, []);
  assert.equal(storyStore.data, null);
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

test('real companion HTTP keeps journals local, requires AI consent, and syncs ciphertext only', async t => {
  const f = await fixture(t);
  const cloudPaths = [];
  const cloud = createServer(async (req, res) => {
    cloudPaths.push(req.url);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const response = await app.request(`https://api.example${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }, f.env, { waitUntil() {} });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(resolve => cloud.listen(0, '127.0.0.1', resolve));
  const unused = createServer(); await new Promise(resolve => unused.listen(0, '127.0.0.1', resolve)); const port = unused.address().port; await new Promise(resolve => unused.close(resolve));
  const directory = await mkdtemp(resolve('.test-output/companion-'));
  await writeFile(resolve(directory, 'index.html'), '<html><head></head><body>Lacuna</body></html>');
  const cookieValue = randomBytes(32).toString('hex'), cookieHash = createHash('sha256').update(cookieValue).digest('hex');
  const store = { data: { hostId: 'urn:uuid:host', registrations: {}, browserSessions: { [cookieHash]: { auth: { jwt: f.jwt, user: f.user }, expires: Date.now() + 3600000 } }, profiles: { [f.user.id]: { access_token: 'never-expose-this', email: 'plan@example.com' } } }, async save() {} };
  let inferenceCalls = 0;
  const plan = { async disconnect() { return true; }, async models() { return [{ slug: 'test-model', name: 'Test model' }]; }, async generate(_id, _model, prompt) { inferenceCalls++; return prompt.system.includes('extract') ? '{"themes":["home"],"emotions":[],"entities":[]}' : '{"acknowledgment":"Held."}'; } };
  const companion = await startCompanion({ port, dataDir: directory, buildDir: directory, apiUrl: `http://127.0.0.1:${cloud.address().port}`, store, plan });
  try {
    const home = await fetch(companion.origin);
    assert.match(await home.text(), /lacuna-companion/);
    const cookie = `lacuna_companion_${port}=${cookieValue}`;
    const headers = { Cookie: cookie, Origin: companion.origin, 'Content-Type': 'application/json' };
    const local = (path, method = 'GET', value) => fetch(`${companion.origin}${path}`, { method, headers, body: value === undefined ? undefined : JSON.stringify(value) });
    const denied = await fetch(`${companion.origin}/companion/connect`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' } });
    assert.equal(denied.status, 403);
    assert.equal((await local('/api/entries')).status, 423);
    assert.equal((await local('/companion/vault/unlock', 'POST', { create: true, passphrase: 'synthetic test vault passphrase' })).status, 200);
    const created = await local('/api/entries', 'POST', { body: 'home is quiet', solidified_at: 123, entry_id: 'b'.repeat(32) });
    assert.equal(created.status, 200);
    assert.equal(inferenceCalls, 0);
    assert.equal((await local('/companion/reflect', 'POST')).status, 400);
    assert.equal((await local('/companion/vault/preferences', 'PATCH', { aiAllowed: true, automaticAI: false })).status, 200);
    assert.equal((await local('/companion/reflect', 'POST')).status, 202);
    let status;
    for (let i = 0; i < 50; i++) {
      status = await (await fetch(`${companion.origin}/companion/status`, { headers })).json();
      if (status.state === 'complete' || status.state === 'error') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(status.state, 'complete', JSON.stringify(status));
    assert.equal(JSON.stringify(status).includes('never-expose-this'), false);
    const patterns = await (await local('/api/patterns')).json();
    assert.equal(patterns.model_weights.acknowledgment, 'Held.');
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM entries').get().n, 0);
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM memoir_snapshots').get().n, 0);
    assert.equal((await local('/companion/vault/sync', 'POST', { enabled: true })).status, 200);
    const encrypted = f.DB.sqlite.prepare('SELECT envelope FROM encrypted_vaults').get().envelope;
    for (const secret of ['home is quiet', 'Held.', 'synthetic test vault passphrase', 'never-expose-this']) assert.equal(encrypted.includes(secret), false);
    assert.equal(cloudPaths.some(path => /^\/(entries|patterns|ai|story)/.test(path)), false);
    const backup = await (await local('/companion/vault/backup')).json();
    assert.equal(backup.format, 'lacuna.vault.v1'); assert.equal(JSON.stringify(backup).includes('home is quiet'), false);
    assert.equal((await local('/companion/vault/lock', 'POST')).status, 200);
    assert.equal((await local('/api/story')).status, 423);
    assert.equal((await local('/companion/vault/restore', 'POST', { envelope: backup, passphrase: 'synthetic test vault passphrase' })).status, 200);
    const restored = await (await local('/companion/vault/status')).json(); assert.equal(restored.aiAllowed, false); assert.equal(restored.sync.enabled, false);
    assert.equal((await (await local('/api/entries')).json()).entries.length, 1);
    await createEntry(f.DB, f.user.id, 'older synthetic cloud thought', 123);
    assert.equal((await local('/companion/vault/migrate', 'POST')).status, 200);
    assert.equal((await local('/api/entries')).status, 423);
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM entries').get().n, 0);
    assert.equal((await local('/companion/vault/unlock', 'POST', { passphrase: 'synthetic test vault passphrase' })).status, 200);
    assert.equal((await (await local('/api/entries')).json()).entries.length, 2);
    const signedOut = await (await local('/api/auth/logout', 'POST')).json();
    assert.equal(signedOut.revoked, true);
    assert.equal((await f.request('/auth/me')).status, 401);
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
    assert.equal((await fetch(callback, { headers: { Cookie: otherCookie }, redirect: 'manual' })).status, 400);
    assert.equal((await fetch(callback, { headers, redirect: 'manual' })).status, 303);
    assert.equal((await (await fetch(`${companion.origin}/companion/session`, { headers: { Cookie: otherCookie } })).json()).session, null);
    const result = await (await fetch(`${companion.origin}/companion/session`, { headers })).json();
    assert.ok(result.session?.user, JSON.stringify(result));
    assert.equal(result.session.jwt, undefined);
    const user = result.session.user;
    assert.notEqual(user.id, f.user.id, 'matching emails must never claim an existing account');
    const serverSession = Object.values(store.data.browserSessions)[0];
    assert.equal((await f.request('/auth/me', 'GET', undefined, serverSession.auth.jwt)).status, 200);
    assert.equal(JSON.stringify(result).includes('private-access'), false);
    assert.equal(JSON.stringify(result).includes(lastToken), false);
    assert.deepEqual((await (await fetch(`${companion.origin}/companion/session`, { headers })).json()).session.user, user);
    assert.equal((await f.request('/auth/openai/complete', 'POST', { challenge: lastAttempt.challenge, clientId: 'issued-client', idToken: lastToken })).status, 401);
    const second = await (await f.request('/auth/openai/start', 'POST', { consent: true })).json();
    assert.equal((await f.request('/auth/openai/complete', 'POST', { challenge: second.id, clientId: 'issued-client', idToken: lastToken })).status, 401);
    const signed = await idToken(second.nonce);
    const responses = await Promise.all([1, 2].map(() => f.request('/auth/openai/complete', 'POST', { challenge: second.id, clientId: 'issued-client', idToken: signed })));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
    assert.equal((await responses.find(r => r.status === 200).json()).user.id, user.id);
    const tested = await fetch(`${companion.origin}/companion/test`, { method: 'POST', headers });
    assert.deepEqual(await tested.json(), { ok: true, text: 'Lacuna is connected.' });
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM entries').get().n, 0);
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM openai_identities').get().n, 1);
    assert.equal(f.DB.sqlite.prepare('SELECT display_email FROM openai_identities').get().display_email, 'ChatGPT account');
    assert.equal((await f.request('/auth/account', 'DELETE', undefined, serverSession.auth.jwt)).status, 200);
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM openai_identities').get().n, 0);
  } finally { await companion.close(); await new Promise(resolve => cloud.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});

test('corrupt stored concepts render safely and rebuild from the original thoughts', async t => {
  const f = await fixture(t);
  await createEntry(f.DB, f.user.id, 'a thought to rebuild', 123);
  await f.DB.prepare('INSERT INTO memory_graph (user_id, graph_json) VALUES (?, ?)').bind(f.user.id, '{"nodes":[null],"processed_count":1}').run();
  await f.DB.prepare('INSERT INTO patterns (user_id, graph_extracted_through) VALUES (?, ?)').bind(f.user.id, 1).run();
  assert.deepEqual((await (await f.request('/story')).json()).graph, { nodes: [], processed_count: 0 });
  const job = await acquireSnapshot(f.DB, f.user.id, 'chatgpt');
  assert.equal(job.snapshot.extracted, 0);
  assert.equal(job.snapshot.entries.length, 1);
});

test('archive search and kept thoughts paginate across all history without crossing accounts', async t => {
  const f = await fixture(t);
  const other = await upsertUser(f.DB, 'other@example.com');
  const ids = [];
  for (let i = 0; i < 25; i++) ids.push((await createEntry(f.DB, f.user.id, `Home ${i} 100%_literal`, 123)).id);
  const foreign = await createEntry(f.DB, other.id, 'Home private', 123);
  const originalVersion = (await f.request('/ai/status').then(r => r.json())).pending;
  for (const id of ids.slice(0, 3)) await f.DB.prepare('UPDATE entries SET kept_at = unixepoch() WHERE id = ?').bind(id).run();
  assert.equal((await f.request('/ai/status').then(r => r.json())).pending, originalVersion);
  assert.equal((await f.request(`/entries/${foreign.id}/keep`, 'PATCH', { kept: true })).status, 410);
  const kept = await (await f.request('/entries?kept=1&q=home')).json();
  assert.equal(kept.entries.length, 3);
  const first = await (await f.request('/entries?q=HOME&limit=20')).json();
  const second = await (await f.request(`/entries?q=HOME&limit=20&cursor=${first.nextCursor}`)).json();
  assert.equal(new Set([...first.entries, ...second.entries].map(e => e.id)).size, 25);
  assert.equal((await (await f.request('/entries?q=100%25_literal')).json()).entries.length, 20);
  assert.equal((await (await f.request(`/entries?q=home&cursor=${foreign.id}`)).json()).entries.length, 0);
  assert.equal((await f.request('/entries?kept=anything')).status, 400);
  const story = await (await f.request('/story')).json();
  assert.equal(story.summary.total, 25); assert.equal(story.summary.kept, 3);
  assert.deepEqual(story.graph.nodes, []);
  await f.DB.prepare('UPDATE entries SET kept_at = NULL WHERE id = ?').bind(ids[0]).run();
  assert.equal((await (await f.request('/entries?kept=1')).json()).entries.length, 2);
});

test('memoir history has stable same-second pagination and account isolation; export excludes credentials', async t => {
  const f = await fixture(t);
  const other = await upsertUser(f.DB, 'other@example.com');
  await createEntry(f.DB, f.user.id, 'my own words', 123);
  await createEntry(f.DB, other.id, 'foreign-secret-words', 123);
  for (let i = 0; i < 13; i++) await f.DB.prepare('INSERT INTO memoir_snapshots (user_id, prose, generated_at) VALUES (?, ?, ?)').bind(f.user.id, `edition ${i}`, 123).run();
  const foreign = await f.DB.prepare('INSERT INTO memoir_snapshots (user_id, prose, generated_at) VALUES (?, ?, ?) RETURNING id').bind(other.id, 'foreign-secret-memoir', 123).first();
  const latest = await (await f.request('/memoir')).json();
  const first = await (await f.request('/memoir/history')).json();
  const second = await (await f.request(`/memoir/history?cursor=${first.nextCursor}`)).json();
  assert.equal(first.editions[0].id, latest.id);
  assert.equal(first.editions.length, 10); assert.equal(second.editions.length, 3);
  assert.equal(new Set([...first.editions, ...second.editions].map(e => e.id)).size, 13);
  assert.equal(second.nextCursor, null);
  assert.equal((await (await f.request(`/memoir/history?cursor=${foreign.id}`)).json()).editions.length, 0);
  assert.equal((await f.request('/story/export', 'GET', undefined, 'invalid')).status, 401);
  const archive = await (await f.request('/story/export')).json();
  assert.equal(archive.entries.length, 1); assert.equal(archive.memoirs.length, 13);
  const serialized = JSON.stringify(archive);
  for (const forbidden of ['foreign-secret', 'test-secret-only', 'magic_token', 'access_token', 'refresh_token', f.jwt]) assert.equal(serialized.includes(forbidden), false);
  assert.match(archiveMarkdown(archive), /my own words/);
  assert.match(archiveMarkdown(archive), /edition 12/);
  assert.equal(groupThoughts(archive.entries).flatMap(g => g.entries).length, 1);
  for (let i = 0; i < 5; i++) assert.equal((await f.request('/story/export')).status, 200);
  assert.equal((await f.request('/story/export')).status, 429);
});

const samplePassphrase = 'sample only long vault passphrase';
async function localVault(t, options) {
  const directory = await mkdtemp(resolve('.test-output/vault-'));
  const vault = new Vault(directory, 'a'.repeat(32), options);
  t.after(async () => { vault.lock(); await rm(directory, { recursive: true, force: true }); });
  await vault.unlock(samplePassphrase, true);
  return vault;
}
const localURL = path => new URL(path, 'http://127.0.0.1:1455');
const thought = (n, body = `sample thought ${n}`) => ({ entry_id: n.toString(16).padStart(32, '0'), body, solidified_at: 123 });

test('vault encrypts all journal data, authenticates ciphertext, and never saves its key or passphrase', async t => {
  const vault = await localVault(t);
  await journalRequest(vault, '/entries', 'POST', thought(1, 'synthetic-secret-journal'), localURL('/entries'));
  await vault.verifySaved();
  const envelope = await vault.envelope(), serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes('synthetic-secret-journal'), false);
  assert.equal(serialized.includes(samplePassphrase), false);
  assert.equal(serialized.includes(vault.key.toString('hex')), false);
  assert.equal(envelope.kdf, 'scrypt-131072-8-1');
  vault.lock(); assert.throws(() => vault.read(), /Unlock/);
  await assert.rejects(vault.unlock('this is the wrong passphrase'), /Could not unlock/);
  assert.equal(vault.unlocked, false);
  await vault.unlock(samplePassphrase); assert.equal(vault.read().entries[0].body, 'synthetic-secret-journal');
  const tampered = { ...envelope, tag: '0'.repeat(32) };
  await assert.rejects(vault.restore(tampered, samplePassphrase), /could not be unlocked/);
  assert.equal(vault.read().entries.length, 1);
  await assert.rejects(vault.restore({ ...envelope, owner: 'b'.repeat(32) }, samplePassphrase), /Invalid encrypted/);
  assert.deepEqual((await readdir(vault.directory)).filter(f => f.endsWith('.tmp')), []);
});
test('idle polling never extends vault lifetime and locking cancels an in-flight unlock', async t => {
  let time = Date.now(); const vault = await localVault(t, { now: () => time });
  time += LOCK_AFTER_MS - 100; vault.read();
  time += 101; assert.equal(vault.unlocked, false);
  const opening = vault.unlock(samplePassphrase); vault.lock();
  await assert.rejects(opening, /cancelled/); assert.equal(vault.unlocked, false);
  await vault.unlock(samplePassphrase); time += LOCK_AFTER_MS - 100; vault.activity(); time += 101;
  assert.equal(vault.unlocked, true);
});
test('local saves serialize, retry idempotently, validate input, and keep searching isolated', async t => {
  const vault = await localVault(t);
  await Promise.all(Array.from({ length: 25 }, (_, i) => journalRequest(vault, '/entries', 'POST', thought(i, `Home ${i} 100%_literal`), localURL('/entries'))));
  const retried = await journalRequest(vault, '/entries', 'POST', { ...thought(0, 'Home 0 100%_literal'), solidified_at: 124 }, localURL('/entries'));
  assert.equal(retried.entry.solidified_at, 123, 'a later retry retains the original save timestamp');
  assert.equal(vault.read().entries.length, 25);
  await assert.rejects(journalRequest(vault, '/entries', 'POST', thought(0, 'different'), localURL('/entries')), /already used/);
  for (const value of [{ body: 5 }, thought(26, 'x'.repeat(501)), { ...thought(26), solidified_at: 'yesterday' }]) await assert.rejects(journalRequest(vault, '/entries', 'POST', value, localURL('/entries')), /Invalid thought/);
  await assert.rejects(journalRequest(vault, '/patterns', 'PATCH', { model_weights: { story_thread: 2 } }, localURL('/patterns')), /Invalid/);
  const first = await journalRequest(vault, '/entries', 'GET', null, localURL('/entries?q=100%25_literal&limit=20'));
  const second = await journalRequest(vault, '/entries', 'GET', null, localURL(`/entries?q=100%25_literal&limit=20&cursor=${first.nextCursor}`));
  assert.equal(new Set([...first.entries, ...second.entries].map(e => e.id)).size, 25);
  await assert.rejects(journalRequest(vault, '/entries', 'GET', null, localURL(`/entries?q=other&cursor=${first.nextCursor}`)), /Invalid archive/);
  const before = vault.read().version;
  await journalRequest(vault, `/entries/${thought(0).entry_id}/keep`, 'PATCH', { kept: true }, localURL('/'));
  assert.equal(vault.read().version, before);
  assert.equal((await journalRequest(vault, '/entries', 'GET', null, localURL('/entries?kept=1'))).entries.length, 1);
});
test('local deletion and AI opt-out reject stale reflections and clear derived private text', async t => {
  const vault = await localVault(t);
  await journalRequest(vault, '/entries', 'POST', thought(1), localURL('/entries'));
  await vault.update(d => { d.aiAllowed = true; d.memoirs.push({ id: 'sample', prose: 'old generated words', generated_at: 123 }); });
  const source = snapshot(vault.read());
  await journalRequest(vault, `/entries/${thought(1).entry_id}`, 'DELETE', null, localURL('/'));
  await assert.rejects(applyAnalysis(vault, source, emptyResult), /journal changed/);
  assert.equal(vault.read().memoirs.length, 0);
  await vault.update(d => { d.aiAllowed = false; });
  await assert.rejects(applyAnalysis(vault, snapshot(vault.read()), emptyResult), /journal changed/);
});
test('failed durable local writes preserve the old encrypted journal', async t => {
  const vault = await localVault(t);
  await journalRequest(vault, '/entries', 'POST', thought(1), localURL('/'));
  const before = await readFile(vault.path, 'utf8'), path = vault.path;
  vault.path = resolve(vault.directory, 'missing', 'cannot-write.vault');
  await assert.rejects(journalRequest(vault, '/entries', 'POST', thought(2), localURL('/')));
  vault.path = path;
  assert.equal(vault.read().entries.length, 1);
  assert.equal(await readFile(path, 'utf8'), before);
});
test('legacy migration verifies a durable encrypted copy, guards versions, and preserves other accounts', async t => {
  const f = await fixture(t), other = await upsertUser(f.DB, 'other-migration@example.test');
  await createEntry(f.DB, f.user.id, 'old private journal', 123);
  await createEntry(f.DB, other.id, 'other private journal', 123);
  await f.DB.prepare('INSERT INTO memoir_snapshots (user_id, prose) VALUES (?, ?)').bind(f.user.id, 'old private memoir').run();
  const legacy = await (await f.request('/privacy/legacy')).json();
  const directory = await mkdtemp(resolve('.test-output/migration-')), vault = new Vault(directory, f.user.id);
  t.after(async () => { vault.lock(); await rm(directory, { recursive: true, force: true }); });
  await vault.unlock(samplePassphrase, true); await importLegacy(vault, legacy);
  const disk = new Vault(directory, f.user.id); await disk.unlock(samplePassphrase); assert.equal(disk.read().entries[0].body, 'old private journal'); disk.lock();
  assert.equal((await f.request('/privacy/migrate', 'POST', { version: legacy.version + 1 })).status, 409);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM entries').get().n, 2);
  assert.equal((await f.request('/privacy/migrate', 'POST', { version: legacy.version })).status, 200);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM entries WHERE user_id = ?').get(f.user.id).n, 0);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM entries WHERE user_id = ?').get(other.id).n, 1);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM memoir_snapshots WHERE user_id = ?').get(f.user.id).n, 0);
  assert.equal((await f.request('/privacy/migrate', 'POST', { version: legacy.version })).status, 409);
});
test('encrypted cloud sync is account scoped, rejects plaintext, and detects conflicts and deleted-copy resurrection', async t => {
  const f = await fixture(t), directory = await mkdtemp(resolve('.test-output/sync-')), vault = new Vault(directory, f.user.id);
  t.after(async () => { vault.lock(); await rm(directory, { recursive: true, force: true }); });
  await vault.unlock(samplePassphrase, true); const envelope = await vault.envelope();
  assert.equal((await f.request('/privacy/sync', 'PUT', { version: 0, envelope: { ...envelope, passphrase: samplePassphrase } })).status, 400);
  assert.equal((await f.request('/privacy/sync', 'PUT', { version: 0, envelope: { body: 'plaintext' } })).status, 400);
  assert.equal((await f.request('/privacy/sync', 'PUT', { version: 0, envelope: { ...envelope, owner: 'b'.repeat(32) } })).status, 400);
  assert.deepEqual(await (await f.request('/privacy/sync', 'PUT', { version: 0, envelope })).json(), { version: 1 });
  assert.equal((await f.request('/privacy/sync', 'PUT', { version: 0, envelope })).status, 409);
  assert.deepEqual(await (await f.request('/privacy/sync', 'PUT', { version: 1, envelope })).json(), { version: 2 });
  assert.equal((await f.request('/privacy/sync', 'GET', undefined, 'forged')).status, 401);
  assert.equal((await f.request('/privacy/sync', 'DELETE')).status, 200);
  assert.equal((await f.request('/privacy/sync', 'PUT', { version: 2, envelope })).status, 409);
  const remote = await (await f.request('/privacy/sync')).json(); assert.equal(remote.envelope, null); assert.equal(remote.version, 3);
});
test('large cloud ciphertext is atomically chunked below D1 row limits and failed writes preserve the old version', async t => {
  const f = await fixture(t), vault = await localVault(t);
  const envelope = { ...await vault.envelope(), owner: f.user.id, ciphertext: randomBytes(1800000).toString('base64') };
  assert.equal((await f.request('/privacy/sync', 'PUT', { version: 0, envelope })).status, 200);
  const rows = f.DB.sqlite.prepare('SELECT length(ciphertext) AS size FROM encrypted_vault_chunks').all();
  assert.equal(rows.length, 3); assert.ok(rows.every(r => r.size <= 1000000));
  const remote = await (await f.request('/privacy/sync')).json(); assert.deepEqual(remote.envelope, envelope);
  f.DB.sqlite.exec("CREATE TRIGGER fail_chunk BEFORE INSERT ON encrypted_vault_chunks BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END");
  assert.equal((await f.request('/privacy/sync', 'PUT', { version: 1, envelope: { ...envelope, ciphertext: 'AAAA' } })).status, 500);
  const kept = await (await f.request('/privacy/sync')).json(); assert.equal(kept.version, 1); assert.deepEqual(kept.envelope, envelope);
  const other = await upsertUser(f.DB, 'isolated-sync@example.test'), jti = crypto.randomUUID();
  await f.DB.prepare('INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?, ?, unixepoch() + 3600)').bind(jti, other.id).run();
  const jwt = await new SignJWT({ sub: other.id, email: 'ChatGPT account' }).setJti(jti).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(f.env.JWT_SECRET));
  assert.equal((await (await f.request('/privacy/sync', 'GET', undefined, jwt)).json()).envelope, null);
  assert.equal((await f.request('/privacy/sync', 'PUT', { version: 0, envelope }, jwt)).status, 400);
  assert.equal((await f.request('/auth/account', 'DELETE')).status, 200);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM encrypted_vault_chunks').get().n, 0);
});
test('restoring a cloud copy requires the key and preserves a prior encrypted local copy', async t => {
  const vault = await localVault(t), remote = await vault.envelope();
  await journalRequest(vault, '/entries', 'POST', thought(1, 'new local words'), localURL('/'));
  await assert.rejects(vault.restore(remote, 'wrong cloud vault passphrase'), /could not be unlocked/);
  assert.equal(vault.read().entries.length, 1);
  await vault.restore(remote, samplePassphrase); assert.equal(vault.read().entries.length, 0);
  const backups = (await readdir(vault.directory)).filter(f => f.endsWith('.backup')); assert.equal(backups.length, 1);
  assert.equal((await readFile(resolve(vault.directory, backups[0]), 'utf8')).includes('new local words'), false);
  await vault.remove(); assert.deepEqual(await readdir(vault.directory), []);
});
test('server sessions revoke immediately and old bearer tokens cannot bypass the new session table', async t => {
  const f = await fixture(t);
  const oldJWT = await new SignJWT({ sub: f.user.id, email: f.user.email }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(new TextEncoder().encode(f.env.JWT_SECRET));
  assert.equal((await f.request('/auth/me', 'GET', undefined, oldJWT)).status, 401);
  assert.equal((await f.request('/auth/me')).status, 200);
  assert.equal((await f.request('/auth/logout', 'POST')).status, 200);
  assert.equal((await f.request('/auth/me')).status, 401);
});
test('login limits store keyed IP pseudonyms and no raw IP address', async t => {
  const f = await fixture(t), ip = '192.0.2.123';
  const response = await app.request('https://api.example/auth/openai/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify({ consent: true }) }, f.env);
  assert.equal(response.status, 200);
  const keys = f.DB.sqlite.prepare('SELECT key FROM rate_limits').all();
  assert.equal(JSON.stringify(keys).includes(ip), false); assert.ok(keys.length);
  assert.match(response.headers.get('permissions-policy'), /geolocation=\(\)/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});
test('ambient colors initialize without network calls or a location request', t => {
  const originalFetch = globalThis.fetch, navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => { globalThis.fetch = originalFetch; if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator; });
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('No network allowed for ambient color'); };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, get() { calls++; throw new Error('No device permission needed'); } });
  initWeather(); assert.equal(weather.status, 'ready'); assert.equal(calls, 0);
});
