import { Hono } from 'hono';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import { getLatestMemoir } from '../db.js';

type Variables = { user: JwtPayload };

export const memoirRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

memoirRoute.use('*', authMiddleware);

memoirRoute.get('/', async (c) => {
  const user = c.get('user');
  const memoir = await getLatestMemoir(c.env.DB, user.sub);
  if (!memoir) {
    return c.json(null);
  }
  return c.json({ id: memoir.id, prose: memoir.prose, generated_at: memoir.generated_at });
});

memoirRoute.get('/history', async c => {
  const userId = c.get('user').sub;
  const cursor = c.req.query('cursor');
  const clauses = ['user_id = ?'];
  const args: (string | number)[] = [userId];
  if (cursor) {
    const row = await c.env.DB.prepare('SELECT rowid AS ordinal, generated_at FROM memoir_snapshots WHERE id = ? AND user_id = ?').bind(cursor, userId).first<{ ordinal: number; generated_at: number }>();
    if (!row) return c.json({ editions: [], nextCursor: null });
    clauses.push('(generated_at < ? OR (generated_at = ? AND rowid < ?))');
    args.push(row.generated_at, row.generated_at, row.ordinal);
  }
  const rows = await c.env.DB.prepare(`SELECT id, prose, generated_at FROM memoir_snapshots WHERE ${clauses.join(' AND ')} ORDER BY generated_at DESC, rowid DESC LIMIT 11`).bind(...args).all();
  const editions = rows.results.slice(0, 10);
  return c.json({ editions, nextCursor: rows.results.length > 10 ? editions.at(-1)?.id : null });
});
