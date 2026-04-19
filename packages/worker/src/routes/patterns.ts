import { Hono } from 'hono';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import { getPatterns, upsertPatterns } from '../db.js';

type Variables = { user: JwtPayload };

export const patternsRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

patternsRoute.use('*', authMiddleware);

patternsRoute.get('/', async (c) => {
  const user = c.get('user');
  const row = await getPatterns(c.env.DB, user.sub);
  if (!row) {
    return c.json({ model_weights: {}, last_updated: null });
  }
  let model_weights: object;
  try {
    model_weights = JSON.parse(row.model_weights);
  } catch {
    model_weights = {};
  }
  return c.json({ model_weights, last_updated: row.last_updated });
});

patternsRoute.patch('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ model_weights?: object }>();
  if (!body.model_weights || typeof body.model_weights !== 'object') {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'model_weights required' } }, 400);
  }
  await upsertPatterns(c.env.DB, user.sub, body.model_weights);
  return c.json({ ok: true });
});
