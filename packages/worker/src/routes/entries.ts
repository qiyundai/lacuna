import { Hono } from 'hono';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import { createEntry, deleteEntry, getEntries, EntryConflictError } from '../db.js';
import { checkRateLimit } from '../ratelimit.js';

const MAX_ENTRY_LENGTH = 500;

type Variables = { user: JwtPayload };

export const entriesRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

entriesRoute.use('*', authMiddleware);

entriesRoute.get('/', async (c) => {
  const user = c.get('user');
  const cursor = c.req.query('cursor') ?? null;
  const requested = Number(c.req.query('limit') ?? '20');
  if (!Number.isInteger(requested) || requested < 1) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid page size' } }, 400);
  }
  const limit = Math.min(requested, 50);
  const query = c.req.query('q')?.trim() ?? '';
  const kept = c.req.query('kept');
  if (query.length > 200 || (kept !== undefined && kept !== '1')) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid search.' } }, 400);
  const entries = await getEntries(c.env.DB, user.sub, cursor, limit, { query, kept: kept === '1' });
  const nextCursor = entries.length === limit ? (entries[entries.length - 1]?.id ?? null) : null;

  return c.json({ entries, nextCursor });
});

entriesRoute.post('/', async (c) => {
  const user = c.get('user');

  const allowed = await checkRateLimit(c.env.DB, `entry:${user.sub}`, 50, 3600);
  if (!allowed) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many entries' } }, 429);
  }

  const body = await c.req.json<{ body?: string; solidified_at?: number; entry_id?: string }>();

  if (typeof body?.body !== 'string' || !body.body.trim()) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Entry body is required' } }, 400);
  }
  if (body.solidified_at !== undefined && (!Number.isSafeInteger(body.solidified_at) || body.solidified_at < 0 || body.solidified_at > Math.floor(Date.now() / 1000) + 300)) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid timestamp' } }, 400);
  }
  if (body.body.length > MAX_ENTRY_LENGTH) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Entry too long' } }, 400);
  }

  const solidifiedAt = body.solidified_at ?? Math.floor(Date.now() / 1000);
  if (body.entry_id !== undefined && (typeof body.entry_id !== 'string' || !/^[a-f0-9]{32}$/.test(body.entry_id))) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid entry ID' } }, 400);
  let entry;
  try { entry = await createEntry(c.env.DB, user.sub, body.body.trim(), solidifiedAt, body.entry_id); }
  catch (err) {
    if (err instanceof EntryConflictError) return c.json({ error: { code: 'CONFLICT', message: 'Entry ID already used' } }, 409);
    throw err;
  }

  return c.json({ entry }, 201);
});

entriesRoute.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const deleted = await deleteEntry(c.env.DB, user.sub, id);
  if (!deleted) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Entry not found' } }, 404);
  }
  return c.json({ ok: true });
});

entriesRoute.patch('/:id/keep', async c => {
  const body = await c.req.json<{ kept?: unknown }>();
  if (typeof body?.kept !== 'boolean') return c.json({ error: { code: 'BAD_REQUEST', message: 'Choose whether to keep this thought.' } }, 400);
  const entry = await c.env.DB.prepare(`UPDATE entries SET kept_at = CASE WHEN ? THEN coalesce(kept_at, unixepoch()) ELSE NULL END
    WHERE id = ? AND user_id = ? RETURNING *`).bind(body.kept ? 1 : 0, c.req.param('id'), c.get('user').sub).first();
  return entry ? c.json({ entry }) : c.json({ error: { code: 'NOT_FOUND', message: 'Thought not found.' } }, 404);
});
