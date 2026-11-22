import test from 'node:test';
import './living-book.test.mjs';
import './city-details.test.mjs';
import './city-clock.test.mjs';
import { journalDetails } from '../packages/frontend/src/lib/town/journal-details.ts';
import { paintedCoast } from '../packages/frontend/src/lib/town/painted-coast.ts';
import { emptyBook, nextBookTask, acceptBookResult } from '../packages/shared/living-book.ts';
import assert from 'node:assert/strict';
import { districts } from '../packages/frontend/src/lib/town/districts.ts';
import { parseAlbum } from '../packages/frontend/src/lib/music-library.ts';

test('playlist reprises keep distinct positions and preserve saved IDs for the first occurrence', () => {
  const address = new URL('https://lacuna.example/music/river/album.m3u8');
  const tracks = parseAlbum([
    '#EXTM3U', '#PLAYLIST:River', '#EXTINF:90,Opening', 'bend.m4a',
    '#EXTINF:-1,Reprise', 'bend.m4a', '#EXTINF:120,Return', 'return.m4a?mix=2'
  ].join('\r\n'), address);
  assert.equal(tracks[0].id, '/music/river/album.m3u8#/music/river/bend.m4a');
  assert.equal(tracks[1].url, tracks[0].url);
  assert.equal(tracks[1].seconds, undefined);
  assert.equal(new Set(tracks.map(track => track.id)).size, 3);
  assert.equal(tracks[2].url, '/music/river/return.m4a?mix=2');
  assert.deepEqual(tracks.map(track => track.title), ['Opening', 'Reprise', 'Return']);
});

test('a river crossing keeps its founding page and opens the far bank to later pages', () => {
  const page = (id, body, presence) => ({ id, body, presence, created_at: Number(id) });
  const journal = [
    page('1', 'I planted basil.', '1'),
    page('2', 'I wonder if we made peace.', '1'),
    page('3', 'We finally talked again. I brought basil.', '1'),
    page('4', 'We shared dinner.', '1'),
    page('5', 'Walking home in the rain.', '5')
  ];
  assert.equal(districts(journal.slice(0, 2))[0].landing, undefined);
  const [garden, quay, walk] = districts(journal);
  assert.equal(garden.landing.entry.id, '3');
  assert.equal(garden.landing.crossing, 'We finally talked again.');
  assert.equal(garden.farBank, false);
  assert.equal(quay.farBank, true);
  assert.equal(quay.thread, garden.thread);
  assert.equal(quay.pages[0].activity, 'market');
  assert.equal(walk.farBank, false);
  assert.deepEqual(districts(structuredClone(journal)), [garden, quay, walk]);
  assert.equal(new Set([garden, quay, walk].flatMap(d => d.pages.map(p => p.entry.id))).size, journal.length);
});
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
import { WebVault, envelopeToken } from '../packages/frontend/src/lib/web-vault.ts';
import { webRequest } from '../packages/frontend/src/lib/web-api.ts';
import { advance, firstMorning, home, population, workday } from '../packages/shared/river.ts';

test('settling the same cook on opposite banks changes deliveries, meals and paths', () => {
  const cook = {id:'cook',body:'I miss cooking for friends.'};
  assert.deepEqual(home(cook),{trade:'cook',site:0});
  const workforce = site => population([{...cook,settlement:{trade:'cook',site}}]);
  const clock = firstMorning(100);
  const west = workday(workforce(3),clock.grain);
  const east = workday(workforce(4),clock.grain);
  assert.ok(east.fed[1] > west.fed[1]);
  assert.ok(west.mealsMoved[1] > east.mealsMoved[1]);
  assert.ok(east.grainMoved[1] > west.grainMoved[1]);
  const later = advance(clock,workforce(4),5000);
  assert.equal(later.day,5001);
  assert.equal(later.traffic[4],100);
  assert.equal(later.traffic[3],0);
  assert.deepEqual(later,advance(advance(clock,workforce(4),4900),workforce(4),100));
});

test('both encrypted journals keep a settlement, serialize plot claims and retry a morning once', async t => {
  const desktop=await localVault(t), browser=new WebVault(webStorage());
  await browser.unlock(samplePassphrase,true);
  for(const request of [
    (path,method,value)=>webRequest(path,method,value,browser),
    (path,method,value)=>journalRequest(desktop,path,method,value,localURL(path))
  ]){
    const arrival={...thought(7,'Dinner with friends'),settlement:{trade:'cook',site:4}};
    await request('/entries','POST',arrival);
    await request('/entries','POST',arrival);
    await assert.rejects(request('/entries','POST',{...thought(8),settlement:{trade:'grower',site:4}}),/site/);
    const day=await request('/town','GET');
    assert.equal(day.entries.length,1);
    assert.deepEqual(day.entries[0].settlement,arrival.settlement);
    const tomorrow=await request('/town/day','POST',{day:day.clock.day});
    const retry=await request('/town/day','POST',{day:day.clock.day});
    assert.deepEqual(tomorrow.clock,retry.clock);
    await request('/entries/'+arrival.entry_id,'DELETE');
    assert.deepEqual((await request('/town','GET')).entries,[]);
    await request('/entries','POST',{...thought(8),settlement:{trade:'grower',site:4}});
  }
});

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
  const companion = await startCompanion({ reflectionsEnabled:true, port, dataDir: directory, buildDir: directory, apiUrl: `http://127.0.0.1:${cloud.address().port}`, store, plan });
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
    assert.equal(tested.status,503);
    assert.equal((await tested.json()).error.code,'COMING_SOON');
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
test('forgetting keeps only address metadata in both vaults after reopening', async t => {
  const desktop = await localVault(t), browser = new WebVault(webStorage());
  await browser.unlock(samplePassphrase, true);
  for (const vault of [desktop, browser]) {
    const request = (path, method = 'GET', value) => vault === browser
      ? webRequest(path, method, value, vault)
      : journalRequest(vault, path.split('?')[0], method, value, localURL(path));
    const secret = 'violet ticket in an empty suitcase';
    const {entry} = await request('/entries', 'POST', thought(1, secret));
    await request('/entries', 'POST', thought(2, 'a page to keep'));
    const last = await request('/entries', 'POST', thought(3));
    await vault.update(data => { data.memoirs.push({id:'old', prose:secret, generated_at:123}); });
    const forget = id => request('/entries/' + id, 'DELETE');
    const {address} = await forget(last.entry.id);
    assert.equal(address.position, 2);
    const receipt = await forget(entry.id);
    assert.deepEqual(receipt.address, {id:entry.id, created_at:entry.created_at, riverEdition:3, position:0, forgottenAfter:3});
    assert.deepEqual(await forget(entry.id), receipt);
    await assert.rejects(request('/entries', 'POST', thought(1, secret)), /forgotten/);
    if (vault === desktop) await importLegacy(vault, {entries:[entry], memoirs:[], summaries:[]});
    vault.lock();
    await vault.unlock(samplePassphrase);
    assert.equal(JSON.stringify(vault.read()).includes(secret), false);
    assert.deepEqual((await request('/city')).forgotten, [receipt.address, address]);
    for (const path of ['/city', '/village', '/story/export', '/entries']) {
      assert.deepEqual((await request(path)).entries.map(e=>e.id), [thought(2).entry_id]);
    }
    assert.equal((await request('/entries?q=violet')).entries.length, 0);
  }
});

test('browser memoir survives encrypted restore without sharing consent and forgets from both exports offline',async()=>{
  const storage=webStorage(),vault=new WebVault(storage);
  await vault.unlock(samplePassphrase,true);
  for(let i=0;i<6;i++)await webRequest('/entries','POST',thought(i,'Synthetic scene '+i),vault);
  await vault.update(d=>{
    d.entries.forEach((e,i)=>{e.created_at=100+i*86400;e.writingDay=i;});
    d.reflectionConsent={account:'fixture',epoch:1};d.book=emptyBook();
    let task;
    while((task=nextBookTask(d.book,d.entries))){
      const first=task.evidence[0];
      acceptBookResult(d.book,d.entries,task,task.kind==='observe'?{notes:[{topic:first.id,quote:first.body}]}:{title:'A week',prose:first.body,readings:[]});
    }
  });
  const restored=new WebVault(webStorage());await restored.restore(await vault.backup(),samplePassphrase);
  restored.lock();await restored.unlock(samplePassphrase);
  assert.equal(restored.read().reflectionConsent,undefined);
  const previous=restored.read().book.chapters[0].passages[1];
  await webRequest('/entries/'+thought(0).entry_id,'DELETE',undefined,restored);
  restored.lock();await restored.unlock(samplePassphrase);
  const archive=await webRequest('/story/export','GET',undefined,restored);
  assert.deepEqual(archive.book.chapters[0].passages,[previous]);
  assert.ok(!JSON.stringify(archive).includes('Synthetic scene 0'));
  assert.ok(!archiveMarkdown(archive).includes('Synthetic scene 0'));
  assert.ok(archiveMarkdown(archive).includes(previous.prose));
});

test('local forgetting and AI opt-out reject stale reflections and clear derived private text', async t => {
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

function webStorage() {
  return { current: null, backups: [], failed: false,
    async read() { return structuredClone(this.current); },
    async replace(expected, envelope, backup = false) {
      if (this.failed) throw new Error('synthetic quota failure');
      if (envelopeToken(this.current) !== expected) throw new Error('synthetic conflicting tab');
      if (backup && this.current) this.backups.push(structuredClone(this.current));
      this.current = structuredClone(envelope);
      if (!envelope) this.backups = [];
    },
  };
}
test('phone vault persists ciphertext only and reopens without an account or network', async t => {
  const originalFetch = globalThis.fetch; t.after(() => globalThis.fetch = originalFetch);
  globalThis.fetch = () => { throw new Error('Browser journaling must not contact a server'); };
  const storage = webStorage(), vault = new WebVault(storage);
  await vault.unlock(samplePassphrase, true);
  await webRequest('/entries', 'POST', thought(1, 'synthetic private phone thought'), vault);
  const encrypted = JSON.stringify(storage.current);
  assert.equal(encrypted.includes('synthetic private phone thought'), false); assert.equal(encrypted.includes(samplePassphrase), false);
  assert.equal(storage.current.kdf, 'pbkdf2-sha256-600000');
  vault.lock(); assert.throws(() => vault.read(), /Unlock/);
  const reopened = new WebVault(storage); await reopened.unlock(samplePassphrase);
  assert.equal((await webRequest('/entries', 'GET', undefined, reopened)).entries[0].body, 'synthetic private phone thought');
  assert.equal((await webRequest('/ai/status', 'GET', undefined, reopened)).pending, 0);
  await assert.rejects(webRequest('/ai/refresh', 'POST', undefined, reopened), /not connected/);
});
test('phone vault rejects wrong keys and tampering, and unlock cannot defeat a lock', async () => {
  const storage = webStorage(), vault = new WebVault(storage); await vault.unlock(samplePassphrase, true);
  const backup = await vault.backup(); vault.lock();
  await assert.rejects(vault.unlock('incorrect long passphrase'), /Could not unlock/);
  const opening = vault.unlock(samplePassphrase); vault.lock(); await assert.rejects(opening, /cancelled/);
  await assert.rejects(vault.restore({ ...backup, owner: '0'.repeat(32) }, samplePassphrase), /could not be unlocked/);
  assert.deepEqual(storage.current, backup);
});
test('phone saves serialize and competing tabs or quota failures retain the existing journal', async () => {
  const storage = webStorage(), first = new WebVault(storage); await first.unlock(samplePassphrase, true);
  const otherTab = new WebVault(storage); await otherTab.unlock(samplePassphrase);
  await Promise.all(Array.from({ length: 8 }, (_, i) => webRequest('/entries', 'POST', thought(i), first)));
  const before = structuredClone(storage.current);
  await assert.rejects(webRequest('/entries', 'POST', thought(99), otherTab), /conflicting tab/);
  assert.deepEqual(storage.current, before); assert.equal(otherTab.read().entries.length, 0);
  storage.failed = true; await assert.rejects(webRequest('/entries', 'POST', thought(100), first), /quota/);
  assert.deepEqual(storage.current, before); assert.equal(first.read().entries.length, 8);
  storage.failed = false;
  const retried = await webRequest('/entries', 'POST', { ...thought(1), solidified_at: 124 }, first);
  assert.equal(retried.entry.solidified_at, 123); assert.equal(first.read().entries.length, 8);
});
test('phone encrypted backups restore on another device, preserve conflict copies, and clear on deletion', async () => {
  let time = Date.now(); const storage = webStorage(), vault = new WebVault(storage, () => time);
  await vault.unlock(samplePassphrase, true); await webRequest('/entries', 'POST', thought(1), vault);
  const backup = await vault.backup(); await webRequest('/entries', 'POST', thought(2), vault);
  await vault.restore(backup, samplePassphrase); assert.equal(vault.read().entries.length, 1); assert.equal(storage.backups.length, 1);
  const otherStorage = webStorage(), other = new WebVault(otherStorage); await other.restore(backup, samplePassphrase); assert.equal(other.read().entries.length, 1);
  time += 15 * 60 * 1000 + 1; assert.equal((await vault.status()).locked, true);
  await vault.unlock(samplePassphrase); await webRequest('/auth/account', 'DELETE', undefined, vault);
  assert.equal(storage.current, null); assert.equal(storage.backups.length, 0);
});
test('an encrypted city backup reconstructs its furnishings after forgetting and locking', async () => {
  const vault=new WebVault(webStorage());
  await vault.unlock(samplePassphrase,true);
  for(let i=0;i<18;i++)await webRequest('/entries','POST',{...thought(i,'I swam at dawn, then made tea.'),city:true},vault);
  function decorations(journal){
    return journalDetails(paintedCoast(journal.entries,journal.forgotten),journal.entries);
  }
  const first=decorations(vault.read());
  assert.ok(first.addresses.size>1);
  const removed=[...first.addresses.values()][0][0].page;
  await webRequest('/entries/'+removed,'DELETE',undefined,vault);
  const expected=decorations(vault.read()),backup=await vault.backup();
  vault.lock();
  const restored=new WebVault(webStorage());
  await restored.restore(backup,samplePassphrase);
  assert.deepEqual(decorations(restored.read()),expected);
  assert.ok(![...expected.addresses.values()].flat().some(detail=>detail.page===removed));
  assert.ok(!JSON.stringify(restored.read().forgotten).includes('detail'));
});
test('phone archive searches and kept markers use the complete encrypted local journal', async () => {
  const vault = new WebVault(webStorage()); await vault.unlock(samplePassphrase, true);
  for (let i = 0; i < 25; i++) await webRequest('/entries', 'POST', thought(i, `Home ${i}`), vault);
  await webRequest(`/entries/${thought(1).entry_id}/keep`, 'PATCH', { kept: true }, vault);
  assert.equal((await webRequest('/entries?kept=1', 'GET', undefined, vault)).entries.length, 1);
  const first = await webRequest('/entries?q=home', 'GET', undefined, vault), second = await webRequest(`/entries?q=home&cursor=${encodeURIComponent(first.nextCursor)}`, 'GET', undefined, vault);
  assert.equal(new Set([...first.entries, ...second.entries].map(e => e.id)).size, 25);
  await webRequest(`/entries/${thought(1).entry_id}`, 'DELETE', undefined, vault);
  assert.equal((await webRequest('/story/export', 'GET', undefined, vault)).entries.length, 24);
});
import { presences, birdHabit } from '../packages/shared/village.ts';
import { interpretVillagePage } from '../packages/companion/src/village.mjs';

test('the two encrypted villages preserve distinct histories at the same doorway', async t => {
  const desktop=await localVault(t),browser=new WebVault(webStorage());
  await browser.unlock(samplePassphrase,true);
  for(const request of [
    (path,method,value)=>webRequest(path,method,value,browser),
    (path,method,value)=>journalRequest(desktop,path,method,value,localURL(path))
  ]){
    const first=thought(410,'Dad sends me the forecast every morning.');
    const second=thought(411,'I sent him the forecast first today.');
    const other=thought(412,'Dad and I argued about selling the house.');
    await request('/entries','POST',first);
    const event={entry:first.entry_id,action:'sheltered'};
    await request('/village/encounter','POST',event);
    await request('/village/encounter','POST',event);
    await request('/entries','POST',second);
    await request('/entries','POST',other);
    const {entries}=await request('/village','GET');
    const [bird,otherBird]=presences(entries);
    assert.deepEqual(bird.entries.map(e=>e.body),[first.body,second.body]);
    assert.deepEqual(bird.entries[0].traces,['sheltered']);
    assert.equal(otherBird.id,other.entry_id);
    assert.equal(birdHabit(bird),'return-to-door');
    const split=await request('/village/thread','POST',{entry:second.entry_id,separate:true});
    assert.equal(presences(split.entries).length,3);
    const joined=await request('/village/thread','POST',{entry:second.entry_id,separate:false});
    assert.equal(presences(joined.entries).length,2);
    const passed={...bird,entries:bird.entries.map((e,i)=>i===0?{...e,traces:['passed']}:e)};
    assert.equal(birdHabit(passed),'wait-for-you');
    await assert.rejects(request('/village/encounter','POST',{entry:first.entry_id,action:'invent'}));
    await request('/entries/'+first.entry_id,'DELETE');
    const survivors=presences((await request('/village','GET')).entries);
    assert.equal(survivors[0].id,bird.id);
    assert.equal(birdHabit(survivors[0]),'lead');
    assert.deepEqual(survivors[0].entries.map(e=>e.body),[second.body]);
  }
});

test('an optional village reading requires sharing and grounded excerpts and preserves encountered pages', async t=>{
  const vault=await localVault(t);
  const save=n=>journalRequest(vault,'/entries','POST',n,localURL('/entries'));
  const first=thought(520,'The kettle was already on when I arrived.');
  const next=thought(521,'I put two cups out for her this time.');
  await save(first);await save(next);
  let calls=0;
  const generate=async()=>{calls++;return JSON.stringify({gesture:'company',quote:'two cups',thread:0,earlierQuote:'kettle was already on'});};
  await assert.rejects(interpretVillagePage(vault,next.entry_id,generate),/sharing/);
  assert.equal(calls,0);
  await vault.update(d=>{d.aiAllowed=true;});
  await assert.rejects(interpretVillagePage(vault,next.entry_id,async()=>JSON.stringify({gesture:'company',quote:'gave a hug',thread:null})),/grounded/);
  const {entry}=await interpretVillagePage(vault,next.entry_id,generate);
  assert.equal(entry.presence,first.entry_id);
  assert.equal(entry.reading.gesture,'company');
  await interpretVillagePage(vault,next.entry_id,generate);
  assert.equal(calls,1);
  const last=thought(522,'An unrelated page.');
  await save(last);
  await vault.update(d=>{d.entries.at(-1).traces=['passed'];});
  await interpretVillagePage(vault,last.entry_id,generate);
  assert.equal(calls,1);
});

test('city growth follows the saved sequence independently of page meaning and calendar gaps', async () => {
  const {cityFromPages}=await import('../packages/frontend/src/lib/town/city-growth.ts');
  const pages=Array.from({length:60},(_,i)=>({id:'page-'+i,created_at:Math.floor(i/2),body:'rain'}));
  const original=cityFromPages(pages);
  assert.deepEqual(original,cityFromPages(pages.map(p=>({...p,created_at:p.created_at*86400*365,body:'something else'}))));
  assert.deepEqual(cityFromPages([]).blocks,[]);
  assert.equal(new Set(original.blocks.map(b=>b.x+','+b.z)).size,original.blocks.length);
  assert.ok(original.blocks.some(b=>b.green));
  assert.ok(original.blocks.some(b=>b.levels>1));
  const past=cityFromPages(pages.slice(0,-1));
  assert.deepEqual(past.blocks.map(b=>b.seed),original.blocks.slice(0,past.blocks.length).map(b=>b.seed));
  assert.equal(original.blocks.reduce((sum,b)=>sum+b.levels,0),pages.length);
});

test('city saves on both vaults preserve words and skip the legacy story classifier',async t=>{
  const desktop=await localVault(t),browser=new WebVault(webStorage());
  await browser.unlock(samplePassphrase,true);
  for(const send of [
    value=>webRequest('/entries','POST',value,browser),
    value=>journalRequest(desktop,'/entries','POST',value,localURL('/entries'))
  ]){
    const value={...thought(948,'A page with no particular theme.'),city:true};
    const {entry}=await send(value);
    assert.equal(entry.body,value.body);
    assert.equal(entry.riverEdition,3);
    assert.equal(entry.presence,undefined);
    assert.deepEqual((await send(value)).entry,entry);
  }
});

test('a journal grows connected parcels upstream and every page keeps a stable city address',async()=>{
  const {paintedCoast}=await import('../packages/frontend/src/lib/town/painted-coast.ts');
  const first={id:'z',created_at:100},second={id:'a',created_at:100};
  assert.deepEqual(paintedCoast([first,second]).sites[0],paintedCoast([first]).sites[0]);
  const signatures=new Set();
  assert.equal(paintedCoast([]).sites.length,0);
  for(let seed=0;seed<12;seed++){
    const pages=Array.from({length:250},(_,i)=>({id:seed+'-folio-'+i,created_at:i}));
    const early=paintedCoast(pages.slice(0,32)),full=paintedCoast(pages);
    assert.equal(full.addresses.size,pages.length);
    assert.ok(full.sites.length<pages.length && full.end>1800);
    assert.ok(full.sites.every(s=>s.x-s.width/2>=full.start && s.x+s.width/2<=full.end));
    const parcels=new Set();
    for(const site of full.sites){
      const col=Math.round((site.x-132-site.lane*8)/157),key=col+','+site.lane;
      assert.ok(!parcels.has(key));
      if(parcels.size)assert.ok([[1,0],[-1,0],[0,1],[0,-1]].some(([dc,dl])=>parcels.has((col+dc)+','+(site.lane+dl))));
      parcels.add(key);
    }
    for(const [id,site] of early.addresses){
      const later=full.addresses.get(id);
      assert.deepEqual([later.id,later.x,later.lane,later.kind],[site.id,site.x,site.lane,site.kind]);
    }
    signatures.add(early.sites.map(s=>s.kind+'/'+s.x).join(','));
    assert.deepEqual(early,paintedCoast(pages.slice(0,32).reverse().map(p=>({...p,body:'different words'}))));
  }
  assert.equal(signatures.size,12);
});

test('new pages settle connected neighborhoods across the ferry while older journals retain their parcels',async()=>{
  const {paintedCoast}=await import('../packages/frontend/src/lib/town/painted-coast.ts');
  const {sitePoint,siteHeading}=await import('../packages/frontend/src/lib/town/harbor-workshop.ts');
  const {bankEdge}=await import('../packages/frontend/src/lib/town/valley-river.ts');
  const archive=Array.from({length:90},(_,i)=>({id:'bank-archive-'+i,created_at:i}));
  const legacy=paintedCoast(archive);
  const signature=Array.from(legacy.addresses,([id,s])=>[id,s.id,s.kind,s.x,s.lane,s.lights]);
  assert.equal(createHash('sha256').update(JSON.stringify(signature)).digest('hex'),'af1e84717c7a278d70288800c38772e6f14769bd2f715d67f00436d994909c3a');
  for(let seed=0;seed<12;seed++){
    const additions=Array.from({length:120},(_,i)=>({id:seed+'-river-'+i,created_at:100+i,riverEdition:2}));
    const prefix=seed%2?archive:[];
    const plan=paintedCoast([...prefix,...additions]);
    for(const page of prefix){
      const s=plan.addresses.get(page.id),before=legacy.addresses.get(page.id);
      assert.deepEqual([s.id,s.kind,s.bank,s.x],[before.id,before.kind,0,before.x]);
    }
    const lots=new Map();
    for(const s of plan.sites){
      const c=Math.round((s.x-132-s.lane*8)/157),key=[s.bank,c,s.lane].join('/');
      assert.ok(!lots.has(key));
      const local=[[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dl])=>lots.has([s.bank,c+dx,s.lane+dl].join('/')));
      assert.ok(!lots.size || local || (s.ferryTerminal && lots.get([1-s.bank,c,3].join('/'))?.ferryTerminal));
      lots.set(key,s);
      const p=sitePoint(s),inward=s.bank?1:-1;
      if(!s.ferryTerminal)assert.ok((p.z-bankEdge(p.x,s.bank))*inward>0);
      assert.ok(Math.cos(siteHeading(s,p.x))*inward<0);
    }
    assert.ok(plan.sites.filter(s=>s.bank===1 && s.lane<3).length>=5);
    assert.ok(plan.sites.some(s=>s.bank===1 && s.ferryTerminal));
    assert.equal(plan.addresses.size,prefix.length+additions.length);
  }
});

test('forgotten pages keep their parcel and historic floors as rooms and ferry stops fall quiet',async()=>{
  const {paintedCoast}=await import('../packages/frontend/src/lib/town/painted-coast.ts');
  const {forgetPageAt,validCityHistory}=await import('../packages/shared/city-address.ts');
  const page=i=>({id:createHash('md5').update('room-'+i).digest('hex'),created_at:Math.floor(i/3),riverEdition:i<16?undefined:i<30?2:3});
  const journal={entries:Array.from({length:120},(_,i)=>page(i)),forgotten:[]};
  const coast=()=>paintedCoast(journal.entries,journal.forgotten);
  const initial=coast();
  const shape=plan=>plan.sites.map(({id,x,lane,bank,width,kind,lights,setback})=>[id,x,lane,bank,width,kind,lights,setback]);
  const forget=id=>{
    const index=journal.entries.findIndex(e=>e.id===id);
    assert.ok(index>=0);
    return forgetPageAt(journal,index);
  };
  const shared=initial.sites.find(site=>site.lights>0);
  const rooms=[...initial.addresses].filter(([,site])=>site===shared).map(([id])=>id);
  const founder=forget(shared.id);
  let plan=coast();
  assert.equal(plan.addresses.has(founder.id),false);
  const stillLit=plan.addresses.get(rooms[1]);
  assert.equal(stillLit.readableId,rooms[1]);
  assert.equal(stillLit.litAdditions,shared.lights-1);
  assert.deepEqual(shape(plan),shape(initial));
  const stop=initial.ports.find(site=>site.bank===1 && site!==shared);
  const stopping=new Set([shared.id,stop.id]);
  for(const [id,site] of initial.addresses)if(id!==founder.id && stopping.has(site.id))forget(id);
  plan=coast();
  assert.deepEqual(shape(plan),shape(initial));
  assert.ok(plan.sites.filter(s=>stopping.has(s.id)).every(s=>s.quiet && s.litAdditions===0));
  assert.ok(plan.ports.every(site=>site.id!==stop.id));
  assert.ok(validCityHistory(journal.entries,journal.forgotten));
  assert.equal(validCityHistory(journal.entries,[{...founder,body:'must never be retained'}]),false);
  while(journal.entries.length)forget(journal.entries.at(-1).id);
  const empty=coast();
  assert.deepEqual(shape(empty),shape(initial));
  assert.deepEqual([empty.addresses.size,empty.service,empty.ports.length],[0,0,0]);
  assert.ok(empty.sites.every(s=>s.quiet));
  journal.entries.push(...Array.from({length:24},(_,i)=>page(120+i)));
  const regrown=coast();
  assert.deepEqual(shape(regrown).slice(0,initial.sites.length),shape(initial));
  const oldIds=new Set(initial.sites.map(s=>s.id));
  assert.ok([...regrown.addresses.values()].every(s=>!oldIds.has(s.id)));
});

test('mixed river editions keep archived addresses and append neighborhoods deterministically',async()=>{
  const {paintedCoast}=await import('../packages/frontend/src/lib/town/painted-coast.ts');
  const archive=Array.from({length:96},(_,i)=>({id:'river-archive-'+i,riverEdition:2,created_at:i}));
  const old=paintedCoast(archive);
  const signature=Array.from(old.addresses,([id,s])=>[id,s.id,s.bank,s.kind,s.x,s.lane,s.width,s.mirror,s.lights]);
  assert.equal(createHash('sha256').update(JSON.stringify(signature)).digest('hex'),'6b5c25bde4c357c72a76fdd11156d240515427132e1a01ac7799739cc2c17952');
  for(let seed=0;seed<12;seed++){
    const pages=Array.from({length:250},(_,i)=>({id:seed+'-district-'+i,created_at:100+Math.floor(i/2),riverEdition:3}));
    const past=seed%2?archive:[];
    const early=paintedCoast([...past,...pages.slice(0,80)]),full=paintedCoast([...past,...pages]);
    const address=s=>[s.id,s.kind,s.bank,s.x,s.lane,s.setback,s.width,s.district];
    for(const [id,s] of early.addresses)assert.deepEqual(address(full.addresses.get(id)),address(s));
    for(const page of past)assert.deepEqual(address(full.addresses.get(page.id)),address(old.addresses.get(page.id)));
    assert.ok([0,1].every(bank=>full.sites.filter(s=>s.bank===bank).length>35));
    assert.ok(new Set(full.sites.map(s=>s.district).filter(Boolean)).size>=3);
    assert.ok(full.ports.length>=4);
    assert.deepEqual(full.ports.slice(0,early.ports.length).map(s=>s.id),early.ports.map(s=>s.id));
    assert.deepEqual(full.ports,full.sites.filter(s=>s.ferryTerminal&&!s.quiet));
    assert.deepEqual(early,paintedCoast([...past,...pages.slice(0,80)].map(p=>({...p,body:'Different words',created_at:p.created_at*86400}))));
  }
});

test('shared places follow their neighbors and mature from activity on the same bank',async()=>{
  const {districtKey,districtOf,influenceAround,sharedPlace}=await import('../packages/frontend/src/lib/town/river-neighborhoods.ts');
  const p={column:4,lane:2,bank:0},key=districtKey(p),other=districtKey({...p,bank:1});
  const site=(kind,column,lane=2)=>({id:kind+column,kind,x:132+column*157+lane*8,lane,bank:0,lights:0,ferryTerminal:kind==='wharf'});
  for(const [first,second,place] of [['houses','terraces','courtyard'],['pines','houses','allotment'],['market','houses','marketCourt'],['warehouse','market','goodsYard'],['station','terraces','waitingGarden']]){
    const cells=new Map(),a=site(first,4),b=site(second,5);
    influenceAround(cells,a);assert.equal(sharedPlace(cells.get(key)),undefined);
    influenceAround(cells,b);assert.deepEqual(sharedPlace(cells.get(key)),{place,stage:1});
    influenceAround(cells,a,true);influenceAround(cells,b,true);
    assert.equal(sharedPlace(cells.get(key)).stage,2);
    influenceAround(cells,site(first,3));influenceAround(cells,site(second,4,1));influenceAround(cells,site(first,4,3));
    assert.deepEqual(sharedPlace(cells.get(key)),{place,stage:3});
    assert.equal(cells.get(other),undefined);
  }
  const cells=new Map();
  influenceAround(cells,site('houses',4));
  influenceAround(cells,site('wharf',4,3));
  assert.equal(districtOf(cells.get(key)),'exchange');
  assert.ok(cells.get(key).access>cells.get(districtKey({...p,column:2})).access);
});

test('new inland addresses use the gentlest surveyed shelf and stay clear of the river',async()=>{
  const {paintedCoast}=await import('../packages/frontend/src/lib/town/painted-coast.ts');
  const {columnOf,parcelShelf}=await import('../packages/frontend/src/lib/town/river-neighborhoods.ts');
  const {sitePoint}=await import('../packages/frontend/src/lib/town/harbor-workshop.ts');
  const {bankEdge,bankPosition,landHeight,laneDepth}=await import('../packages/frontend/src/lib/town/valley-river.ts');
  const plan=paintedCoast(Array.from({length:180},(_,i)=>({id:'shelf-'+i,created_at:i,riverEdition:3})));
  const offsets=new Set();
  for(const site of plan.sites.filter(s=>s.lane<3)){
    const column=columnOf(site),{bank,lane}=site,point=sitePoint(site),shelf=parcelShelf({column,lane,bank});
    assert.equal(site.setback,shelf.setback);offsets.add(shelf.setback);
    const x=(132+column*157+lane*8-900)/12.5,z=bankPosition(x,bank,laneDepth(x,lane));
    const heights=[landHeight(x-3,z),landHeight(x+3,z),landHeight(x,z-2),landHeight(x,z+2)];
    assert.ok(shelf.relief<=Math.max(...heights)-Math.min(...heights));
    assert.equal(point.z,bankPosition(point.x,bank,laneDepth(point.x,lane)+shelf.setback));
    assert.ok((point.z-bankEdge(point.x,bank))*(bank?1:-1)>4);
  }
  assert.ok(offsets.has(1.4) && offsets.has(-1.4));
});

test('short waterfront passages follow gentle gaps and prioritize ferry access',async()=>{
  const {neighborhoodPassages}=await import('../packages/frontend/src/lib/town/harbor-streets.ts');
  const station=c=>(132+(c+.5)*157+12-900)/12.5;
  const lots=[3,4,5].flatMap(column=>[2,3].map(lane=>({site:{kind:'houses',bank:0,lane,x:132+column*157+lane*8}})));
  const left=station(3)-1;
  const street=Array.from({length:69},(_,i)=>({x:left+i*.4,y:0,z:0}));
  const upper=street.map(p=>({...p,y:Math.abs(p.x-station(5))<1?1:3,z:10}));
  const streets=[[],[],upper,street];
  const chosen=()=>neighborhoodPassages(lots,streets).map(p=>p.x);
  assert.deepEqual(chosen(),[station(5)]);
  lots[1].site.ferryTerminal=true;
  assert.deepEqual(chosen(),[station(3)]);
});

test('door approaches retain the least-cost accessible landing on long streets',async()=>{
  const {doorRoute}=await import('../packages/frontend/src/lib/town/harbor-streets.ts');
  const {bankPosition,landHeight}=await import('../packages/frontend/src/lib/town/valley-river.ts');
  for(const bank of [0,1]){
    const line=Array.from({length:300},(_,i)=>{
      const x=i*.5-60,z=bankPosition(x,bank,5);
      return {x,z,y:landHeight(x,z)+.2};
    });
    for(const x of [-52,4,72]){
      const z=bankPosition(x,bank,13),door={x,z,y:landHeight(x,z)+.6};
      const expected=line.map(point=>doorRoute(door,[point])).reduce((a,b)=>a.cost<=b.cost?a:b);
      assert.deepEqual(doorRoute(door,line),expected);
    }
  }
});

test('ferry courses follow relocated stops when an older journal page is removed',async()=>{
  const {paintedCoast}=await import('../packages/frontend/src/lib/town/painted-coast.ts');
  const {mooring}=await import('../packages/frontend/src/lib/town/harbor-workshop.ts');
  const pages=Array.from({length:128},(_,i)=>({id:'0-review-'+i,created_at:i,riverEdition:3}));
  const original=paintedCoast(pages).ports.find(site=>site.id==='0-review-111');
  const moved=paintedCoast(pages.filter((_,i)=>i!==17)).ports.find(site=>site.id===original.id);
  assert.ok(moved && original.x!==moved.x);
  assert.notEqual(mooring(original).station,mooring(moved).station);

});

test('river traffic clears both banks and the crossing, berths, and reverses only beyond town',async()=>{
  const {FerryCourse}=await import('../packages/frontend/src/lib/town/ferry-course.ts');
  const {landHeight}=await import('../packages/frontend/src/lib/town/valley-river.ts');
  const {channelCenter,hiddenStation}=await import('../packages/frontend/src/lib/town/river-passage.ts');
  for(const crossing of [-42,0,33,740])for(const bank of [0,1])for(const visiting of [false,true]){
    const stop={station:crossing+7,bank,offset:4.6,slope:0};
    const course=new FerryCourse(1800,bank?1:-1,visiting?stop:undefined,crossing);
    assert.equal(course.getPoint(0).x,hiddenStation);
    assert.equal(course.getPoint(1).x,1800);
    assert.equal(course.sample(course.duration+8).visible,false);
    assert.equal(course.sample(course.duration+45).direction,-1);
    if(visiting){
      const dwell=course.timeAt(stop.station)+4;
      assert.equal(course.sample(dwell).progress,course.sample(dwell+7).progress);
      assert.ok(Math.abs(course.getPointAt(course.sample(dwell).progress).x-stop.station)<.85);
    }
    for(const x of [crossing-3,crossing-1,crossing,crossing+1,crossing+3,...Array.from({length:480},(_,i)=>hiddenStation+i*4.2)]){
      const t=(x-hiddenStation)/(course.end-hiddenStation);
      const p=course.getPoint(t),tangent=course.getTangent(t);
      for(const length of [-2.5,0,2.55])for(const side of [-.62,.62]){
        const bow=p.x+length*tangent.x-side*tangent.z,z=p.z+length*tangent.z+side*tangent.x;
        assert.ok(landHeight(bow,z)<-.35,'insufficient hull clearance at '+bow+','+z);
        if(Math.abs(bow-crossing)<1)assert.ok(Math.abs(z-channelCenter(crossing))<3.3);
      }
    }
  }
});

test('a multi-arch footbridge meets the two street elevations and survives city growth',async()=>{
  const {bridgeStation,channelCenter}=await import('../packages/frontend/src/lib/town/river-passage.ts');
  const {paintedCoast}=await import('../packages/frontend/src/lib/town/painted-coast.ts');
  const {footbridge}=await import('../packages/frontend/src/lib/town/footbridge.ts');
  const {Raycaster,Vector3}=await import('three');
  const pages=Array.from({length:150},(_,i)=>({id:'bridge-'+i,created_at:i,riverEdition:3}));
  assert.equal(bridgeStation(paintedCoast(pages.slice(0,1)).sites),undefined);
  const x=bridgeStation(paintedCoast(pages.slice(0,32)).sites);
  assert.ok(Number.isFinite(x));assert.equal(bridgeStation(paintedCoast(pages).sites),x);
  const center=channelCenter(x),a=new Vector3(x,1,center-11),b=new Vector3(x,1.35,center+13);
  const bridge=footbridge(a,b);bridge.deck.updateMatrixWorld(true);
  const down=new Raycaster(undefined,new Vector3(0,-1,0));
  for(const [p,offset] of [[a,.02],[b,-.02]]){
    down.ray.origin.set(x,12,p.z+offset);
    const hit=down.intersectObject(bridge.deck)[0];
    assert.ok(hit&&Math.abs(hit.point.y-p.y)<.04);
  }
  let openings=0,previous=false;
  for(let z=a.z+.04;z<b.z;z+=.10){
    const ray=new Raycaster(new Vector3(x-3,.55,z),new Vector3(1,0,0),0,6);
    const open=ray.intersectObject(bridge.deck).length===0;
    if(open&&!previous)openings++;
    previous=open;
  }
  assert.ok(openings>=5);
  for(const z of [-1.6,0,1.6]){
    const navigation=new Raycaster(new Vector3(x-3,2.05,center+z),new Vector3(1,0,0),0,6);
    assert.equal(navigation.intersectObject(bridge.deck).length,0);
  }
  bridge.dispose();
});

test('both founding quays leave the bridge clear and join their streets on the landward side',async()=>{
  const {createFerryHallKit}=await import('../packages/frontend/src/lib/town/ferry-hall.ts');
  const {bridgeStation}=await import('../packages/frontend/src/lib/town/river-passage.ts');
  const {paintedCoast}=await import('../packages/frontend/src/lib/town/painted-coast.ts');
  const {sitePoint,siteHeading}=await import('../packages/frontend/src/lib/town/harbor-workshop.ts');
  const {placeLot,streetLine}=await import('../packages/frontend/src/lib/town/harbor-streets.ts');
  const {Box3}=await import('three');
  const kit=createFerryHallKit();
  for(let seed=0;seed<8;seed++){
    const coast=paintedCoast(Array.from({length:80},(_,i)=>({id:seed+'-district-'+i,created_at:i,riverEdition:3})));
    const x=bridgeStation(coast.sites);
    for(const site of coast.ports.filter(s=>Math.abs(sitePoint(s).x-x)<10)){
      const model=kit.build(5);
      model.position.copy(sitePoint(site));model.rotation.y=siteHeading(site,model.position.x);
      const lot=placeLot(site,model,x);
      const box=new Box3().setFromObject(model,true);
      assert.ok(box.min.x>x+1.19 || box.max.x<x-1.19);
      assert.ok(lot.doors.length>0 && model.worldToLocal(lot.doors[0].landing.clone()).z<-2.27);
      const street=streetLine([lot],3,[x-1.5,x+1.5]);
      const atDoor=street.reduce((a,b)=>Math.abs(a.x-model.position.x)<Math.abs(b.x-model.position.x)?a:b);
      assert.ok(model.worldToLocal(atDoor.clone()).z<-3);
    }
  }
  kit.dispose();
});

test('rail sections end on either side of a boarding opening',async()=>{
  const {railClearance}=await import('../packages/frontend/src/lib/town/harbor-streets.ts');
  const {Vector3}=await import('three');
  const clear=railClearance([]);
  clear.opening(new Vector3(0,0,-1),new Vector3(0,0,1),2);
  assert.deepEqual(clear.sections(new Vector3(-2,0,0),new Vector3(2,0,0)),[[0,.25],[.75,1]]);
});

test('wake samples remain at earlier stern positions through a turn and lose energy at rest',async()=>{
  const {ferryWake,wakeSamples}=await import('../packages/frontend/src/lib/town/ferry-wake.ts');
  const {valleyOrigin}=await import('../packages/frontend/src/lib/town/valley-river.ts');
  const {Vector3}=await import('three');
  const wake=ferryWake(),boat=new Vector3(),heading=new Vector3(1,0,0);
  wake.sample(boat,heading,0,true);
  boat.x=2;wake.sample(boat,heading,1,true);
  const along=wake.trail.value[0].clone();
  boat.z=2;heading.set(0,0,1);wake.sample(boat,heading,2,true);
  assert.deepEqual(wake.trail.value[1],along);
  assert.equal(wake.trail.value[0].x,valleyOrigin.x+2-1.85);
  assert.equal(wake.trail.value[0].y,valleyOrigin.z-2);
  assert.ok(wake.trail.value[0].w>0);
  for(let t=3;t<30;t++)wake.sample(boat,heading,t,true);
  assert.equal(wake.count.value,wakeSamples);
  assert.ok(wake.trail.value.every(p=>p.w===0));
  wake.sample(boat,heading,30,false);assert.equal(wake.count.value,0);
});

test('coastal groves have clearings and clustered saplings that persist across inlet boundaries',async()=>{
  const {plantGroves,groveDensity}=await import('../packages/frontend/src/lib/town/waterfront-meadow.ts');
  const shore=x=>6+10*Math.cos(x*.064);
  const grow=(left,right)=>{
    const trees=[];
    plantGroves(left,right,shore,()=>8,(x,y,z,height,seed)=>{if(Math.abs(x)<65) trees.push([x,y,z,height,seed]);});
    return trees;
  };
  const trees=grow(-72,72);
  assert.deepEqual(trees,grow(-216,216));
  const densities=Array.from({length:130},(_,i)=>groveDensity(i-65,shore(i-65)-40));
  assert.ok(Math.min(...densities)<.1 && Math.max(...densities)>.85);
  const sheltered=trees.filter(t=>groveDensity(t[0],t[2])>.7);
  const open=trees.filter(t=>groveDensity(t[0],t[2])<.15);
  assert.ok(sheltered.length>open.length*3);
  assert.ok(trees.some(a=>a[3]<2 && trees.some(b=>b[3]>3 && Math.hypot(a[0]-b[0],a[2]-b[2])<3)));
});

test('corridor flocks follow world routes above the terrain and return to the same poses after streaming',async()=>{
  const {corridorFlocks}=await import('../packages/frontend/src/lib/town/corridor-flocks.ts');
  const ground=(x,z)=>40+10*Math.sin(x*.05+z*.01);
  const walls={west:-181,east:333};
  const flocks=corridorFlocks(ground,{value:0},walls);
  try{
    const snapshot=()=>flocks.group.children.filter(mesh=>mesh.visible).map(mesh=>[mesh.position.z,mesh.count,...mesh.instanceMatrix.array.slice(0,mesh.count*16)]);
    flocks.tick(32,0);
    const first=snapshot();
    for(const mesh of flocks.group.children.filter(mesh=>mesh.visible)){
      mesh.geometry.computeBoundingBox();
      const bounds=mesh.geometry.boundingBox;
      for(let i=0;i<mesh.count;i++){
        const scale=Math.hypot(...mesh.instanceMatrix.array.slice(i*16,i*16+3));
        const wingspan=(bounds.max.x-bounds.min.x)*scale;
        assert.ok(wingspan>=.85 && wingspan<=1.13);
        const [x,y,z]=mesh.instanceMatrix.array.slice(i*16+12,i*16+15);
        assert.ok(y>ground(x,z+mesh.position.z)+10);
        assert.ok(x>walls.west-54 && x<walls.east+54);
      }
    }
    flocks.tick(36,0);assert.notDeepEqual(snapshot(),first);
    flocks.tick(32,-6200);
    assert.ok(flocks.group.children.every(mesh=>Math.abs(mesh.position.z+6200)<1200));
    flocks.tick(32,0);assert.deepEqual(snapshot(),first);
  }finally{flocks.dispose();}
});

test('each gull enters from behind one wall, flies a full circuit and leaves through the opposite wall',async()=>{
  const {corridorFlocks}=await import('../packages/frontend/src/lib/town/corridor-flocks.ts');
  const walls={west:-181,east:333};
  const flocks=corridorFlocks(()=>0,{value:0},walls);
  try{
    const home=flocks.group.children.find(mesh=>mesh.position.z===0);
    const tracks=Array.from({length:home.count},()=>({side:0,directions:[],trips:0,lastX:0}));
    for(let time=0;time<=900;time++){
      flocks.tick(time,0);
      for(const [i,track] of tracks.entries()){
        const x=home.instanceMatrix.array[i*16+12];
        const side=x<walls.west?-1:x>walls.east?1:0;
        if(side){
          if(track.side && side!==track.side){
            assert.deepEqual(track.directions,[-track.side,track.side,-track.side]);
            track.trips++;
          }
          track.side=side;
          track.directions=[];
        }else if(track.side){
          const dx=x-track.lastX;
          if(Math.abs(dx)>.05 && Math.sign(dx)!==track.directions.at(-1))track.directions.push(Math.sign(dx));
        }
        track.lastX=x;
      }
    }
    assert.ok(tracks.every(track=>track.trips>=2));
  }finally{flocks.dispose();}
});

test('cloud banks grow from land, cross the field, pool below a climbing wisp on either wall and dissolve before respawning',async()=>{
  const {createLowCloud}=await import('../packages/frontend/src/lib/town/low-cloud.ts');
  const T=await import('three');
  const {createBayWorld}=await import('../packages/frontend/src/lib/town/bay-world.ts');
  const world=createBayWorld(new T.Scene());
  const ground=(x,z)=>18+.015*x+.003*z,wall=side=>side*257;
  const sky=createLowCloud(world.lighting,ground,wall,true,6207425);
  try{
    const banks=sky.cloud.children;
    const center=banks[0],uniforms=center.material.uniforms;
    assert.equal(uniforms.sunDirection.value,world.sunDirection);
    const births=[],impacts=new Set();
    let growing=false,radii;
    for(let t=0;t<=1740;t+=1.5){
      sky.tick(t);
      const {x,y,z}=center.position;
      if(!center.visible){growing=false;radii=undefined;continue;}
      if(!growing && center.scale.y<8){
        growing=true;births.push([x,z]);
        assert.ok(y-ground(x,z)<4 && y-center.scale.y*.5<=ground(x,z));
      }
      const puffs=uniforms.puffs.value;
      if(growing && uniforms.humidity.value===1 && center.scale.y>75){
        const sizes=puffs.map(p=>1/p.w);
        if(radii)sizes.forEach((r,i)=>assert.ok(r>=radii[i]-.00001));
        radii=sizes;
      }
      if(radii && uniforms.humidity.value<.6 && Math.abs(x)>195){
        const side=Math.sign(x);
        for(const [i,p] of puffs.entries()){
          assert.ok(Math.abs(1/p.w-radii[i])<.00001);
          assert.ok(side*(x+p.x)+1/p.w>=257);
        }
        assert.ok(Math.abs(x-births.at(-1)[0])>60);
        const base=uniforms.wispBase.value,tip=uniforms.wispTip.value;
        const grounded=puffs.filter(p=>y+p.y-ground(x+p.x,z+p.z)<=1/p.w);
        assert.ok(grounded.length>=4);
        assert.ok(tip.y-base.y>50 && base.w<(tip.y-base.y)*.30);
        assert.ok(side*(x+tip.x)>250 && side*(x+base.x)>240);
        impacts.add(side);
      }
    }
    assert.ok(births.length>=5 && new Set(births.map(([x,z])=>Math.round(x)+','+Math.round(z))).size===births.length);
    assert.equal(impacts.size,2);
    sky.tick(510);
    assert.equal(uniforms.cloudTime.value,170);
    const positions=banks.map(b=>b.position.clone()),supply=uniforms.supply.value.slice();
    sky.tick(513);
    const changes=uniforms.supply.value.map((value,i)=>value-supply[i]);
    assert.ok(changes.some(v=>v>0) && changes.some(v=>v<0));
    sky.tick(510,-5100);assert.ok(banks.every(b=>Math.abs(b.position.z+5100)<3100));
    sky.tick(510);assert.ok(banks.every((b,i)=>b.position.equals(positions[i])));
    assert.deepEqual(uniforms.supply.value,supply);
  }finally{sky.dispose();world.dispose();}
});

test('waterfront earthworks cut into the uphill plot and preserve its walk and the surrounding meadow',async()=>{
  const T=await import('three');
  const {gardenClearance,cutBuildingPlots}=await import('../packages/frontend/src/lib/town/waterfront-gardens.ts');
  const model=new T.Group();model.position.set(12,5,-3);model.rotation.y=.46;
  const lot={model,site:{kind:'houses',width:110}},walk=gardenClearance();
  walk.mark(14,-3,.65);
  const grade=cutBuildingPlots([lot],walk);
  assert.ok(grade(12,-3,6.1)<5);
  assert.equal(grade(14,-3,6.1),6.1);
  assert.equal(grade(12,-3,4),4);
  assert.equal(grade(38,0,7),7);
  assert.equal(cutBuildingPlots([],walk)(12,-3,6.1),6.1);
});

test('corridor trees and grass follow a distant visit and regrow in the same places',async()=>{
  const T=await import('three');
  const {corridorForest,corridorGrass,woodlandAt}=await import('../packages/frontend/src/lib/town/corridor-vegetation.ts');
  const eye=new T.Vector3(20,6,80),trunk=new T.BoxGeometry(),leaves=new T.MeshLambertMaterial();
  const model=new T.Group();model.add(new T.Mesh(trunk,leaves));
  const forest=corridorForest([model],()=>5,(x,z,y)=>woodlandAt(x,z,y,144),0,45);
  const lawn=corridorGrass(()=>5,(x)=>x<10,0,45,{value:0},eye,()=>.5);
  const roots=()=>Array.from(lawn.group.children[0].geometry.getAttribute('growth').array.slice(0,12));
  try{
    lawn.view(eye);forest.view(eye);
    const grass=lawn.group.children[0];
    assert.ok(grass.receiveShadow&&grass.material.isMeshLambertMaterial);
    const normals=grass.geometry.getAttribute('normal'),habitat=grass.geometry.getAttribute('habitat');
    assert.equal(normals.count,grass.geometry.getAttribute('position').count);
    assert.equal(habitat.count,grass.geometry.instanceCount);
    assert.equal(habitat.getY(0),1);
    assert.ok(Math.abs(habitat.getW(0)-.5)<.01);
    const original=roots(),firstTree=forest.group.children[0];
    eye.z=-4300;lawn.view(eye);forest.view(eye);
    assert.ok(!forest.group.children.includes(firstTree));
    const instances=forest.group.children.flatMap(tile=>tile.children);
    assert.ok(instances.reduce((sum,mesh)=>sum+mesh.count,0)>80);
    assert.ok(instances.every(mesh=>mesh.geometry===trunk && mesh.material===instances[0].material && mesh.customDepthMaterial));
    assert.ok(instances[0].material.color.equals(leaves.color));
    assert.ok(lawn.group.children.some(mesh=>mesh.visible&&mesh.geometry.instanceCount>100));
    assert.ok(lawn.group.children.some(mesh=>mesh.visible&&mesh.geometry.boundingBox.distanceToPoint(eye)>120));
    for(const mesh of lawn.group.children){
      const r=mesh.geometry.getAttribute('growth');
      for(let i=0;i<r.count;i++){assert.ok(r.getX(i)>=10);assert.ok(Math.abs(r.getZ(i)-eye.z)<196);}
    }
    eye.z=80;lawn.view(eye);forest.view(eye);
    assert.deepEqual(roots(),original);
  }finally{lawn.dispose();forest.clear();trunk.dispose();leaves.dispose();}
});

test('stylized ground trees keep their volume within each detail budget',async()=>{
  const {coastalTreeGeometry}=await import('../packages/frontend/src/lib/town/coastal-flora.ts');
  let sharedSprayLayout;
  for(const species of [0,1,2]){
    for(const [level,budget] of [2550,365,13].entries()){
      const shape=coastalTreeGeometry(species,level);
      try{
        const positions=shape.getAttribute('position');
        const leafMask=shape.getAttribute('leafMask');
        assert.equal(leafMask.count,positions.count);
        if(level===1){
          const uv=shape.getAttribute('sprayUv');
          const layout=[];
          for(const index of shape.index.array){
            assert.equal(uv.getY(index)>0,Boolean(leafMask.getX(index)));
            layout.push(uv.getX(index),uv.getY(index));
          }
          if(sharedSprayLayout)assert.deepEqual(layout,sharedSprayLayout);
          else sharedSprayLayout=layout;
        }
        assert.ok(leafMask.array.includes(0) && leafMask.array.includes(1));
        assert.ok(shape.index.count/3<=budget);
        assert.equal(shape.getAttribute('color').count,positions.count);
        const normals=shape.getAttribute('normal');
        assert.equal(normals.count,positions.count);
        for(let i=0;i<normals.count;i++){
          assert.ok(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i))>.99);
        }
        shape.computeBoundingBox();
        const {min,max}=shape.boundingBox;
        assert.ok(max.y-min.y>.80 && max.x-min.x>.2 && max.z-min.z>.2);
      }finally{shape.dispose();}
    }
  }
});

test('distant woodland retains planted shapes and neighboring crowns across orbit and streaming',async()=>{
  const T=await import('three');
  const {distantCrowns}=await import('../packages/frontend/src/lib/town/corridor-vegetation.ts');
  const eye=new T.Vector3();
  const light={direction:new T.Vector3(-.4,1.55,-.92).normalize(),direct:new T.Color(),sky:new T.Color(),ground:new T.Color()};
  const canopy=new T.Texture();
  const woods=distantCrowns(()=>8,()=>1,-16,16,light,{value:0},eye,canopy);
  try{
    woods.view(eye);
    const [middle,far]=woods.group.children;
    const collect=band=>new Map(band.children.flatMap(mesh=>{
      const crowns=mesh.geometry.getAttribute('crown');
      return Array.from({length:crowns.count},(_,i)=>[[crowns.getX(i),crowns.getZ(i)].join(','),crowns.getW(i)]);
    }));
    const dense=collect(middle),distant=collect(far);
    assert.ok(middle.children.some(mesh=>mesh.visible && mesh.geometry.boundingBox.min.z>700));
    const shared=[...dense].filter(([key])=>distant.has(key));
    assert.ok(shared.length>100 && shared.length===dense.size);
    assert.ok(shared.every(([key,h])=>distant.get(key)===h));
    const tree=middle.children.find(mesh=>mesh.geometry.instanceCount>8),g=tree.geometry;
    assert.equal(g.getAttribute('position').count,g.getAttribute('position2').count);
    assert.ok(g.getAttribute('northCrown').array.some((value,i)=>i%4===3 && value>0));
    const pose=tree.matrix.clone(),roots=g.getAttribute('crown').array.slice();
    eye.set(12,55,15);woods.view(eye);
    assert.ok(tree.matrix.equals(pose));
    assert.deepEqual(g.getAttribute('crown').array,roots);
    eye.z=-4900;woods.view(eye);eye.set(0,0,0);woods.view(eye);
    assert.deepEqual(collect(middle),dense);
  }finally{woods.dispose();canopy.dispose();}
});

test('both tree detail levels keep every trunk at its planted position and preserve its tint',async()=>{
  const T=await import('three');
  const {batchPlantings,distantTreeGeometry}=await import('../packages/frontend/src/lib/town/tree-batches.ts');
  const full=new T.BoxGeometry(),reduced=new T.TetrahedronGeometry(),material=new T.MeshBasicMaterial();
  distantTreeGeometry.set(full,reduced);
  const positions=[[14,2,-9],[17,4,-11],[48,3,0]];
  const matrices=positions.map(([x,y,z])=>new T.Matrix4().makeScale(4,5,4).setPosition(x,y,z));
  const colors=positions.map((_,i)=>new T.Color().setScalar((i+1)*.25));
  const plantings=batchPlantings(full,material,matrices,colors);
  try{
    plantings.updateMatrixWorld(true);
    assert.equal(plantings.children.length,2);
    const camera=new T.PerspectiveCamera();
    for(const lod of plantings.children){
      for(const offset of [26,28,26]){
        camera.position.copy(lod.position);camera.position.z+=offset;camera.updateMatrixWorld();
        lod.update(camera);
        assert.deepEqual(lod.children.filter(o=>o.visible).map(o=>o.geometry),[full,reduced]);
        assert.ok(lod.children.every(mesh=>mesh.castShadow&&mesh.customDepthMaterial));
      }
      for(const [offset,shape] of [[0,full],[55,reduced]]){
        camera.position.copy(lod.position);camera.position.z+=offset;camera.updateMatrixWorld();
        lod.update(camera);
        const shown=lod.children.filter(o=>o.visible);
        assert.equal(shown.length,1);
        const mesh=shown[0];assert.equal(mesh.geometry,shape);
        for(let i=0;i<mesh.count;i++){
          const color=new T.Color(),matrix=new T.Matrix4();
          mesh.getMatrixAt(i,matrix);mesh.getColorAt(i,color);
          const j=colors.findIndex(c=>c.equals(color));
          assert.ok(matrix.premultiply(mesh.matrixWorld).equals(matrices[j]));
        }
      }
    }
  }finally{
    plantings.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
    full.dispose();reduced.dispose();material.dispose();
  }
});

test('ground trees preserve their planting transform as the camera moves through the detail bands',async()=>{
  const T=await import('three');
  const {treeMeshes}=await import('../packages/frontend/src/lib/town/corridor-vegetation.ts');
  const {distantTreeGeometry}=await import('../packages/frontend/src/lib/town/tree-batches.ts');
  const full=new T.BoxGeometry(),reduced=new T.TetrahedronGeometry(),material=new T.MeshStandardMaterial();
  const model=new T.Group();model.add(new T.Mesh(full,material));model.updateMatrixWorld();
  distantTreeGeometry.set(full,reduced);
  const trees=[{ix:0,iz:0,x:1,y:2,z:3,size:5,species:0,yaw:.62,spread:.91}];
  const adaptive=treeMeshes(trees,[model]);
  try{
    const [lod]=adaptive.children[0].children,[mesh]=lod.children,camera=new T.PerspectiveCamera();
    adaptive.updateMatrixWorld(true);
    assert.equal(mesh.geometry,full);assert.ok(mesh.castShadow && mesh.receiveShadow);
    const matrix=new T.Matrix4();mesh.getMatrixAt(0,matrix);matrix.premultiply(mesh.matrixWorld);
    const expected=new T.Matrix4().makeRotationY(.62).scale(new T.Vector3(4.55,5,4.55)).setPosition(1,2,3);
    assert.ok(matrix.elements.every((n,i)=>Math.abs(n-expected.elements[i])<.00001));
    for(const z of [3,55,90,164,190,192,500,1800]){
      camera.position.set(1,2,z);camera.updateMatrixWorld();lod.update(camera);
      assert.equal(mesh.visible,z===3);
      assert.equal(lod.children.filter(child=>child.visible).length,z<=190?1:0);
    }
  }finally{
    adaptive.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
    full.dispose();reduced.dispose();material.dispose();
  }
});

test('woodland floor shade stays at its planted position as the camera crosses texture bands',async()=>{
  const T=await import('three');
  const {woodlandFloor}=await import('../packages/frontend/src/lib/town/woodland-floor.ts');
  const floor=woodlandFloor(()=>4,()=>0,0,130),group=new T.Group(),parent=new T.Group();
  parent.add(group);
  floor.addGarden(group,[{x:92,y:3,z:0,size:10}]);
  try{
    const sample=(x,z)=>{
      const [left,width,depth]=floor.layout.toArray(),im=floor.texture.image;
      const col=Math.floor((x-left)/width*im.width),row=T.MathUtils.euclideanModulo(Math.floor(z/depth*im.height),im.height);
      return im.data[row*im.width+col];
    };
    floor.view(0);const shade=sample(64,25);
    assert.ok(shade>110);assert.equal(sample(85,25),0);
    for(const eyeZ of [160,-370,5100,0]){floor.view(eyeZ);if(Math.abs(eyeZ)<1000)assert.equal(sample(64,25),shade);}
    parent.remove(group);floor.view(0);assert.equal(sample(64,25),0);
  }finally{floor.dispose();}
});

test('valley gestures accumulate per frame and a two-finger gesture cannot open a page',async()=>{
  const T=await import('three');
  const {valleyInput}=await import('../packages/frontend/src/lib/town/valley-input.ts');
  const canvas=Object.assign(new EventTarget(),{clientHeight:800,focus(){},setPointerCapture(){},ownerDocument:{defaultView:new EventTarget()}});
  const camera=new T.PerspectiveCamera(47),target=new T.Vector3(),events=new AbortController();
  camera.position.set(10,8,30);
  let picks=0,homes=0;
  const input=valleyInput(canvas,camera,target,events.signal,()=>{},()=>{},()=>homes++,()=>picks++);
  const step=()=>input.step(performance.now());
  function send(type,props){
    canvas.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),props));
  }
  function pointer(type,id,x,y){
    send('pointer'+type,{pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y});
  }
  const start=camera.position.clone();
  pointer('down',1,100,100);pointer('move',1,101,100);pointer('up',1,101,100);
  step();assert.equal(picks,1);assert.ok(camera.position.equals(start));
  pointer('down',1,100,100);pointer('move',1,106,100);
  assert.ok(camera.position.equals(start));
  step();assert.ok(camera.position.distanceTo(start)>0 && camera.position.distanceTo(start)<.2);
  const radius=camera.position.distanceTo(target),beforePinch=camera.position.clone();
  pointer('down',2,200,100);step();assert.ok(camera.position.equals(beforePinch));
  pointer('move',2,201,100);step();
  assert.ok(camera.position.distanceTo(target)<radius);
  assert.ok(target.length()>0);
  pointer('up',2,201,100);
  const lifted=camera.position.clone();
  pointer('move',1,106,100);pointer('up',1,106,100);step();
  assert.ok(camera.position.equals(lifted));assert.equal(picks,1);assert.ok(!input.active());
  send('wheel',{deltaY:.5,deltaMode:0});step();
  assert.ok(camera.position.distanceTo(lifted)>0 && camera.position.distanceTo(lifted)<.1);
  const beforeWheel=camera.position.clone();
  send('wheel',{deltaY:100,deltaMode:0});
  const wheelStart=performance.now();
  input.step(wheelStart+16);
  const firstWheelFrame=camera.position.distanceTo(beforeWheel);assert.ok(firstWheelFrame>0 && input.active());
  input.step(wheelStart+90);
  assert.ok(camera.position.distanceTo(beforeWheel)>firstWheelFrame*2 && !input.active());
  send('keydown',{key:'+'});send('keyup',{key:'='});step();assert.ok(!input.active());
  send('keydown',{key:'ArrowLeft'});step();assert.ok(input.active());
  send('blur',{});assert.ok(!input.active());
  send('keydown',{key:'Home'});assert.equal(homes,1);
  events.abort();
});

test('valley orbit stays inside the forest and clears the graded slopes on its way to the eye',async()=>{
  const T=await import('three');
  const {constrainValleyView,valleyZoomLimit}=await import('../packages/frontend/src/lib/town/valley-camera.ts');
  const ground=(x,z)=>9+39*Math.exp(-((z-45)**2)/42)+x*.027;
  const bounds={west:-181,east:333};
  const eye=new T.Vector3(76,16,95),target=new T.Vector3(76,14,0);
  const limit=()=>constrainValleyView(eye,target,bounds,-42000,ground,.65);
  limit();
  assert.ok(eye.z>0&&eye.z<45);
  for(const [x,y,z] of [[7000,2900,90000],[-500,-100,496],[60,-40,-42120],[76,3124,477]]){
    eye.set(x,y,z);target.set(x*.45,y*.13,z*.91);limit();
    assert.ok(eye.distanceTo(target)<=valleyZoomLimit+.001);
    assert.ok(eye.y<=184&&eye.y>=ground(eye.x,eye.z)+1);
    assert.ok(eye.x>=bounds.west+84&&eye.x<=bounds.east-84&&eye.z<=529&&eye.z>=-42180);
    const point=new T.Vector3();
    for(let k=0;k<=100;k++){
      point.lerpVectors(target,eye,k/100);
      assert.ok(point.y>=ground(point.x,point.z)+1);
    }
  }
});

test('the lawn roots blades on every grassy terrain triangle and tapers detail with viewing distance',async()=>{
  const T=await import('three');
  const {createMeadow}=await import('../packages/frontend/src/lib/town/waterfront-meadow.ts');
  const ground=new T.BufferGeometry(),positions=[],normals=[];
  for(let x=0;x<4;x++)for(let j=0;j<3;j++){
    positions.push(x,5,-j);
    normals.push(0,1,0);
  }
  ground.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  ground.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  ground.setAttribute('habitat',new T.Float32BufferAttribute(new Float32Array(12),1));
  const eye=new T.Vector3(2,8,-1),texture=new T.Texture(),lawn=createMeadow(ground,3,eye,texture);
  try {
    const roots=new Set();
    for(const sector of lawn.group.children){
      const {corner,edgeB,edgeC}=sector.geometry.attributes;
      for(let i=0;i<sector.geometry.instanceCount;i++)roots.add([corner.getX(i),corner.getZ(i),edgeB.getX(i),edgeB.getZ(i),edgeC.getX(i),edgeC.getZ(i)].join(','));
    }
    assert.equal(roots.size,12);
    lawn.view();
    assert.ok(lawn.group.children.every(mesh=>mesh.visible));
    eye.set(0,110,0);lawn.view();
    for(const mesh of lawn.group.children){
      const blades=mesh.geometry.getAttribute('position').count/5;
      assert.equal(mesh.visible,blades===7);
    }
    eye.set(0,200,0);lawn.view();
    assert.ok(lawn.group.children.every(mesh=>!mesh.visible));
    eye.set(2,8,-1);lawn.view();
    assert.ok(lawn.group.children.every(mesh=>mesh.visible));
  } finally {lawn.dispose();ground.dispose();texture.dispose();}
});
