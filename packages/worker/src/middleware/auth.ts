import { jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { Env, JwtPayload } from '../types.js';
import { getUserById } from '../db.js';

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

  let identity: JwtPayload;
  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'], requiredClaims: ['sub', 'exp', 'iat'] });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') throw new Error('Invalid claims');
    identity = payload as unknown as JwtPayload;
  } catch {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, 401);
  }
  // Keep downstream errors outside JWT verification; database failures are not expired sessions.
  if (!await getUserById(c.env.DB, identity.sub)) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Account no longer exists' } }, 401);
  }
  c.set('user', identity);
  await next();
  return;
};
