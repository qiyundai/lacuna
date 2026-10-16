// Disposable browser fixture. It never contacts email providers or model APIs.
import { createServer } from 'node:http';
import { startCompanion } from '../packages/companion/src/server.mjs';
import { resolve } from 'node:path';
let entries = [], failNext = true, provider = 'anthropic';
const user = { id: 'browser-fixture', email: 'browser-test@example.com' };
const cloud = createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  const path = new URL(req.url, 'http://127.0.0.1:8788').pathname;
  let value = {}, status = 200;
  if (path === '/auth/me') value = user;
  else if (path === '/auth/request') value = { ok: true };
  else if (path === '/auth/verify') value = { jwt: 'fixture-only', user };
  else if (path === '/ai/status') value = { provider, pending: 0, entryCount: entries.length };
  else if (path === '/ai/provider') { provider = body.provider; value = { ok: true }; }
  else if (path === '/entries' && req.method === 'POST') {
    if (failNext) { failNext = false; status = 503; value = { error: { code: 'OFFLINE', message: 'Test connection interrupted' } }; }
    else { const entry = { id: String(Date.now()), user_id: user.id, body: body.body, created_at: Math.floor(Date.now() / 1000), solidified_at: body.solidified_at }; entries.unshift(entry); value = { entry }; }
  } else if (path === '/entries') value = { entries, nextCursor: null };
  else if (path === '/patterns') value = { model_weights: {}, last_updated: null };
  else if (path === '/memoir') value = null;
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value));
});
await new Promise(resolve => cloud.listen(8788, '127.0.0.1', resolve));
const store = { data: { hostId: 'urn:uuid:fixture', profiles: {}, registrations: {} }, async save() {} };
const companion = await startCompanion({ port: 1455, dataDir: resolve('.test-output/browser'), buildDir: resolve('packages/frontend/build'), apiUrl: 'http://127.0.0.1:8788', store });
console.log(`Disposable browser fixture: ${companion.origin}/auth/verify?token=fixture`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => companion.close().then(() => cloud.close(() => process.exit(0))));
