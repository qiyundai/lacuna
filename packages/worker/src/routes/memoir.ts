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
  return c.json({ prose: memoir.prose, generated_at: memoir.generated_at });
});
