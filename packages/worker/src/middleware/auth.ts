import { jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { Env, JwtPayload } from '../types.js';

type Variables = { user: JwtPayload };

export const authMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    c.set('user', payload as unknown as JwtPayload);
    await next();
    return;
  } catch {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, 401);
  }
};
