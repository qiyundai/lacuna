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
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'], requiredClaims: ['sub', 'exp', 'iat', 'jti'] });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || typeof payload.jti !== 'string') throw new Error('Invalid claims');
    identity = payload as unknown as JwtPayload;
  } catch {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, 401);
  }
  // Keep downstream errors outside JWT verification; database failures are not expired sessions.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at <= unixepoch()'),
    c.env.DB.prepare('DELETE FROM openai_login_challenges WHERE expires_at <= unixepoch()'),
    c.env.DB.prepare('DELETE FROM rate_limits WHERE window_end <= unixepoch()'),
  ]);
  if (!await getUserById(c.env.DB, identity.sub) || !await c.env.DB.prepare('SELECT id FROM auth_sessions WHERE id = ? AND user_id = ? AND expires_at > unixepoch()').bind(identity.jti, identity.sub).first()) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Account no longer exists' } }, 401);
  }
  c.set('user', identity);
  await next();
  return;
};
