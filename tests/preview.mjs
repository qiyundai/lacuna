// Disposable story for browser QA. Never loads production data or OpenAI credentials.
import { createTestDatabase } from './database.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SignJWT } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import app from '../packages/worker/src/index.ts';
import { startCompanion } from '../packages/companion/src/server.mjs';
import { Vault } from '../packages/companion/src/vault.mjs';
import { importLegacy } from '../packages/companion/src/journal.mjs';

const DB = await createTestDatabase();
const user = { id: 'f'.repeat(32), email: 'sample story only' };
await DB.prepare("INSERT INTO users (id, email, ai_provider) VALUES (?, ?, 'chatgpt')").bind(user.id, 'preview@example.test').run();
const fragments = [
  'The kitchen was full of afternoon light. For once I left the dishes and just stood there.',
  'I called home without a reason today. Maybe that was the reason.',
  'There’s a version of me that only exists on the walk back from the station. I like that person.',
  'I keep mistaking being needed for being known. They feel almost the same until the room goes quiet.',
  'The garden is doing something I didn’t plan. I’m trying to let it.',
  'A small good thing: the neighbor remembered my name.',
  'I told her I didn’t know. Nothing fell apart.',
  'Some days belonging is just making tea in the same cup.',
  'That old photograph. I’m starting to see someone trying, instead of someone who should have known better.',
  'The sea was the same color as the sky. I stayed until I stopped looking for the line.',
  'I want to make something without deciding whether it deserves to exist first.',
  'There is still a little summer left in the window.',
];
const now = Math.floor(Date.now() / 1000);
for (let i = 0; i < 32; i++) await DB.prepare('INSERT INTO entries (id, user_id, body, created_at, solidified_at, kept_at) VALUES (?, ?, ?, ?, ?, ?)').bind(i.toString(16).padStart(32, '0'), user.id, fragments[i % fragments.length], now - i * 86400 * 3, now - i * 86400 * 3, i % 7 === 0 ? now : null).run();
const prose = 'For a long time, you measured a day by what it asked of you. The calls returned, the work finished, the small emergencies that made you useful. Then, almost without noticing, you began to write about the light.\n\nAfternoon in the kitchen. A window holding the last of summer. The sea on a day when it forgot to distinguish itself from the sky. These were not solutions to anything. They were places where you could stand without explaining yourself.\n\nHome keeps appearing in your words, but its meaning is changing. Sometimes it is a person you call without a reason. Sometimes a familiar cup. Sometimes the version of you who walks back from the station, briefly unobserved, and feels like someone worth knowing.\n\nYou are learning to leave a few things unfinished. The garden. An answer. The question of whether what you make deserves to exist. There is a gentleness beginning here, and you have not yet decided what to call it.';
for (let i = 0; i < 3; i++) await DB.prepare('INSERT INTO memoir_snapshots (user_id, prose, generated_at) VALUES (?, ?, ?)').bind(user.id, i === 2 ? prose : `An earlier telling.\n\n${prose.slice(0, i === 0 ? 240 : 520)}`, now - (2 - i) * 86400 * 14).run();
await DB.prepare('INSERT INTO patterns (user_id, model_weights) VALUES (?, ?)').bind(user.id, JSON.stringify({ story_thread: .8, voices: .4, blind_spots: .18, unsaid: .3, story_loop: .55, where_you_are: .62, overall_tone: 'A gentler way of belonging.', summaries: { story_thread: 'You keep finding yourself in small, ordinary moments.', voices: 'Usefulness and rest are learning to share the same room.', where_you_are: 'Home is becoming something you carry.' } })).run();
const nodes = [['belonging', 13], ['home', 11], ['small beginnings', 8], ['making things', 7], ['being known', 6], ['ordinary light', 5], ['gentleness', 4], ['rest', 4], ['uncertainty', 3], ['change', 3], ['memory', 2], ['possibility', 2]].map(([concept, count]) => ({ concept, count, weight: .5, type: 'theme' }));
nodes.push(...['hope', 'tenderness', 'uncertainty', 'relief', 'longing'].map((concept, i) => ({ concept, count: 8 - i, weight: .4, type: 'emotion' })));
nodes.push(...['home', 'the garden', 'the station', 'the sea'].map((concept, i) => ({ concept, count: 6 - i, weight: .4, type: 'entity' })));
await DB.prepare('INSERT INTO memory_graph (user_id, graph_json) VALUES (?, ?)').bind(user.id, JSON.stringify({ nodes, processed_count: 32 })).run();
const env = { DB, JWT_SECRET: 'disposable-preview-secret', FRONTEND_ORIGIN: 'http://127.0.0.1:1456' };
const jti = crypto.randomUUID();
await DB.prepare('INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?, ?, unixepoch() + 43200)').bind(jti, user.id).run();
const jwt = await new SignJWT({ sub: user.id, email: user.email }).setJti(jti).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(new TextEncoder().encode(env.JWT_SECRET));
const cloud = createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const response = await app.request(`https://preview.example${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }, env, { waitUntil() {} });
  res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise(resolve => cloud.listen(8788, '127.0.0.1', resolve));
const buildDir = resolve('.test-output/preview-app');
const index = await readFile(resolve(buildDir, 'index.html'), 'utf8');
await writeFile(resolve(buildDir, 'index.html'), index.replace('<head>', `<head><script>localStorage.setItem('lacuna_consented','1');localStorage.setItem('lacuna_intro_shown','1');</script>`));
const directory = await mkdtemp(resolve('.test-output/preview-credentials-'));
const cookie = randomBytes(32).toString('hex'), hash = createHash('sha256').update(cookie).digest('hex');
const store = { data: { hostId: 'urn:uuid:preview', profiles: { [user.id]: { email: 'sample story', model: 'preview', scopes: ['resource.invoke', 'chatgpt.tokens.use.direct'] } }, registrations: {}, browserSessions: { [hash]: { auth: { jwt, user }, expires: Date.now() + 43200000 } } }, async save() {} };
const fixtureVault = new Vault(resolve(directory, 'vaults'), user.id);
await fixtureVault.unlock('sample story vault passphrase', true);
const legacy = await (await app.request('https://preview.example/privacy/legacy', { headers: { Authorization: `Bearer ${jwt}` } }, env)).json();
await importLegacy(fixtureVault, legacy);
await app.request('https://preview.example/privacy/migrate', { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: legacy.version }) }, env);
await fixtureVault.update(d => { d.migrated = true; }); fixtureVault.lock();
const companion = await startCompanion({ port: 1456, dataDir: directory, buildDir, apiUrl: 'http://127.0.0.1:8788', store, plan: { async models() { return [{ slug: 'preview', name: 'Sample story' }]; }, async generate() { throw new Error('Preview does not run inference'); } } });
// Fixture-only authentication. No production code hook or real identity is used.
companion.server.prependListener('request', (req, res) => {
  if (!req.headers.cookie?.split(';').some(c => c.trim() === `lacuna_companion_1456=${cookie}`)) {
    const others = req.headers.cookie?.split(';').filter(c => !c.trim().startsWith('lacuna_companion_1456=')).join(';') ?? '';
    req.headers.cookie = `${others ? others + '; ' : ''}lacuna_companion_1456=${cookie}`;
    res.setHeader('Set-Cookie', `lacuna_companion_1456=${cookie}; HttpOnly; SameSite=Lax; Path=/`);
  }
});
console.log(`Sample story only: ${companion.origin}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => companion.close().then(() => cloud.close(() => { DB.sqlite.close(); rm(directory, { recursive: true, force: true }).then(() => process.exit(0)); })));
