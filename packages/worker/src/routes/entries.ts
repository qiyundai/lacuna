import { Hono } from 'hono';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import { createEntry, deleteEntry, getEntries } from '../db.js';
import { analyzeEntriesAsync } from '../ai/analyzer.js';
import { checkRateLimit } from '../ratelimit.js';

const MAX_ENTRY_LENGTH = 10_000;

type Variables = { user: JwtPayload };

export const entriesRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

entriesRoute.use('*', authMiddleware);

entriesRoute.get('/', async (c) => {
  const user = c.get('user');
  const cursor = c.req.query('cursor') ?? null;
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 50);

  const entries = await getEntries(c.env.DB, user.sub, cursor, limit);
  const nextCursor = entries.length === limit ? (entries[entries.length - 1]?.id ?? null) : null;

  return c.json({ entries, nextCursor });
});

entriesRoute.post('/', async (c) => {
  const user = c.get('user');

  // 50 entries per user per hour
  const allowed = await checkRateLimit(c.env.DB, `entry:${user.sub}`, 50, 3600);
  if (!allowed) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many entries' } }, 429);
  }

  const body = await c.req.json<{ body?: string; solidified_at?: number }>();

  if (!body.body?.trim()) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Entry body is required' } }, 400);
  }
  if (body.body.length > MAX_ENTRY_LENGTH) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Entry too long' } }, 400);
  }

  const solidifiedAt = body.solidified_at ?? Math.floor(Date.now() / 1000);
  const entry = await createEntry(c.env.DB, user.sub, body.body.trim(), solidifiedAt);

  // Fire AI analysis asynchronously — does not block the response
  c.executionCtx.waitUntil(
    analyzeEntriesAsync(c.env, user.sub).catch((err) => console.error('AI analysis failed:', err))
  );

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
