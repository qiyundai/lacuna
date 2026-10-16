import { Hono } from 'hono';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import { getMemoryGraph } from '../db.js';
import { checkRateLimit } from '../ratelimit.js';

export const storyRoute = new Hono<{ Bindings: Env; Variables: { user: JwtPayload } }>();
storyRoute.use('*', authMiddleware);
storyRoute.get('/', async c => {
  const id = c.get('user').sub;
  const [summary, graph] = await Promise.all([
    c.env.DB.prepare(`SELECT count(*) AS total, count(kept_at) AS kept, min(created_at) AS first_at,
      max(created_at) AS last_at FROM entries WHERE user_id = ?`).bind(id).first(),
    getMemoryGraph(c.env.DB, id),
  ]);
  return c.json({ summary, graph });
});

// A complete private archive, requested explicitly by its owner. OAuth credentials
// and authentication state are excluded; generated material remains identifiable.
storyRoute.get('/export', async c => {
  const id = c.get('user').sub;
  if (!await checkRateLimit(c.env.DB, `export:${id}`, 6, 3600)) return c.json({ error: { code: 'RATE_LIMITED', message: 'Please wait before exporting again.' } }, 429);
  const [entries, memoirs, patterns, graph, summaries] = await Promise.all([
    c.env.DB.prepare('SELECT id, body, created_at, solidified_at, kept_at FROM entries WHERE user_id = ? ORDER BY created_at, id').bind(id).all(),
    c.env.DB.prepare('SELECT id, prose, generated_at FROM memoir_snapshots WHERE user_id = ? ORDER BY generated_at, id').bind(id).all(),
    c.env.DB.prepare('SELECT model_weights, last_updated FROM patterns WHERE user_id = ?').bind(id).first(),
    getMemoryGraph(c.env.DB, id),
    c.env.DB.prepare('SELECT from_entry_num, to_entry_num, summary_text, generated_at FROM range_summaries WHERE user_id = ? ORDER BY from_entry_num').bind(id).all(),
  ]);
  return c.json({ format: 'lacuna.archive.v1', exported_at: new Date().toISOString(), entries: entries.results, memoirs: memoirs.results, patterns, graph, summaries: summaries.results });
});
