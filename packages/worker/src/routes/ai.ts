import { Hono } from 'hono';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import { acquireSnapshot, commitAnalysis, releaseAnalysis } from '../ai/storage.js';
import { validResult } from '../ai/pipeline.js';
import { analyzeEntriesAsync } from '../ai/analyzer.js';
import { checkRateLimit } from '../ratelimit.js';

export const aiRoute = new Hono<{ Bindings: Env; Variables: { user: JwtPayload } }>();
aiRoute.use('*', authMiddleware);
aiRoute.get('/status', async c => {
  const id = c.get('user').sub;
  return c.json(await c.env.DB.prepare(`SELECT ai_provider AS provider, entries_version != analyzed_version AS pending,
    (SELECT count(*) FROM entries WHERE user_id = ?) AS entryCount FROM users WHERE id = ?`).bind(id, id).first());
});
aiRoute.patch('/provider', async c => {
  const body = await c.req.json<{ provider?: unknown }>();
  if (!body || !['anthropic', 'chatgpt'].includes(body.provider as string)) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid provider' } }, 400);
  const id = c.get('user').sub;
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM analysis_jobs WHERE user_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND ai_provider != ?)').bind(id, id, body.provider),
    c.env.DB.prepare('UPDATE users SET ai_provider = ?, entries_version = entries_version + 1 WHERE id = ? AND ai_provider != ?').bind(body.provider, id, body.provider),
  ]);
  return c.json({ ok: true });
});
aiRoute.post('/refresh', async c => {
  if (!await checkRateLimit(c.env.DB, `analysis:${c.get('user').sub}`, 30, 3600)) return c.json({ error: { code: 'RATE_LIMITED', message: 'Please wait before refreshing again' } }, 429);
  c.executionCtx.waitUntil(analyzeEntriesAsync(c.env, c.get('user').sub).catch(err => console.error('Analysis failed:', err.name)));
  return c.json({ ok: true }, 202);
});
aiRoute.post('/context', async c => {
  if (!await checkRateLimit(c.env.DB, `analysis:${c.get('user').sub}`, 30, 3600)) return c.json({ error: { code: 'RATE_LIMITED', message: 'Please wait before refreshing again' } }, 429);
  const job = await acquireSnapshot(c.env.DB, c.get('user').sub, 'chatgpt');
  if (!job) return c.json({ error: { code: 'BUSY', message: 'Analysis is busy or ChatGPT plan use is disabled' } }, 409);
  return c.json(job);
});
aiRoute.post('/results', async c => {
  const body = await c.req.json<{ lease?: unknown; version?: unknown; result?: unknown }>();
  if (!body || typeof body.lease !== 'string' || !Number.isSafeInteger(body.version) || !validResult(body.result)) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid analysis result' } }, 400);
  const row = await c.env.DB.prepare('SELECT count(*) AS count FROM entries WHERE user_id = ?').bind(c.get('user').sub).first<{ count: number }>();
  if (body.result.extracted > (row?.count ?? 0) || body.result.memoirCount > (row?.count ?? 0)) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid analysis checkpoints' } }, 400);
  const saved = await commitAnalysis(c.env.DB, c.get('user').sub, body.lease, body.version as number, 'chatgpt', body.result);
  return saved ? c.json({ ok: true }) : c.json({ error: { code: 'STALE', message: 'Entries changed; refresh to try again' } }, 409);
});
aiRoute.delete('/job/:lease', async c => {
  await releaseAnalysis(c.env.DB, c.get('user').sub, c.req.param('lease'));
  return c.json({ ok: true });
});
