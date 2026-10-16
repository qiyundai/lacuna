import { Hono } from 'hono';
import { SignJWT } from 'jose';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import { deleteUser } from '../db.js';
import { checkRateLimit } from '../ratelimit.js';
import { OPENAI_ISSUER, verifyOpenAIIdentity } from '../openai-identity.js';

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export const authRoute = new Hono<{ Bindings: Env; Variables: { user: JwtPayload } }>();
authRoute.post('/openai/start', async c => {
  const body = await c.req.json<{ consent?: unknown }>();
  if (body?.consent !== true) return c.json({ error: { code: 'CONSENT_REQUIRED', message: 'Acknowledge data and privacy first.' } }, 400);
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  if (!await checkRateLimit(c.env.DB, `openai-login:${ip}`, 20, 900)) return c.json({ error: { code: 'RATE_LIMITED', message: 'Please wait before signing in again.' } }, 429);
  const id = crypto.randomUUID(), nonce = crypto.randomUUID() + crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM openai_login_challenges WHERE expires_at <= unixepoch()'),
    c.env.DB.prepare('INSERT INTO openai_login_challenges (id, nonce, expires_at) VALUES (?, ?, unixepoch() + 600)').bind(id, nonce),
  ]);
  return c.json({ id, nonce });
});
authRoute.post('/openai/complete', async c => {
  const body = await c.req.json<{ challenge?: unknown; clientId?: unknown; idToken?: unknown }>();
  if (typeof body?.challenge !== 'string' || typeof body.clientId !== 'string' || !body.clientId || body.clientId.length > 256 || body.clientId === 'dynamic_agent_client' || typeof body.idToken !== 'string' || body.idToken.length > 32000) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid sign-in response.' } }, 400);
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  if (!await checkRateLimit(c.env.DB, `openai-verify:${ip}`, 40, 900)) return c.json({ error: { code: 'RATE_LIMITED', message: 'Please wait before signing in again.' } }, 429);
  const challenge = await c.env.DB.prepare('SELECT nonce FROM openai_login_challenges WHERE id = ? AND expires_at > unixepoch()').bind(body.challenge).first<{ nonce: string }>();
  if (!challenge) return c.json({ error: { code: 'INVALID_IDENTITY', message: 'Sign-in expired. Continue with ChatGPT again.' } }, 401);
  let identity;
  try { identity = await verifyOpenAIIdentity(body.idToken, body.clientId, challenge.nonce); }
  catch { return c.json({ error: { code: 'INVALID_IDENTITY', message: 'ChatGPT identity could not be verified. Sign in again.' } }, 401); }
  const consumed = await c.env.DB.prepare('DELETE FROM openai_login_challenges WHERE id = ? AND nonce = ? AND expires_at > unixepoch() RETURNING id').bind(body.challenge, challenge.nonce).first();
  if (!consumed) return c.json({ error: { code: 'INVALID_IDENTITY', message: 'This sign-in was already used. Sign in again.' } }, 401);
  const key = await hashToken(JSON.stringify([OPENAI_ISSUER, body.clientId, identity.subject]));
  const userId = key.slice(0, 32);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO users (id, email, consent_given_at, ai_provider) VALUES (?, ?, unixepoch(), 'chatgpt') ON CONFLICT DO NOTHING`).bind(userId, `${key}@chatgpt.invalid`),
    c.env.DB.prepare(`INSERT INTO openai_identities (identity_key, user_id, display_email) VALUES (?, ?, ?) ON CONFLICT(identity_key) DO UPDATE SET display_email = excluded.display_email`).bind(key, userId, identity.email),
  ]);
  const row = await c.env.DB.prepare('SELECT user_id FROM openai_identities WHERE identity_key = ?').bind(key).first<{ user_id: string }>();
  if (!row || row.user_id !== userId) throw new Error('Identity mapping failed');
  const jwt = await new SignJWT({ sub: userId, email: identity.email }).setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().setExpirationTime('7d').sign(new TextEncoder().encode(c.env.JWT_SECRET));
  return c.json({ jwt, user: { id: userId, email: identity.email } });
});
// Retired email links cannot create sessions, including links issued before migration.
authRoute.post('/request', c => c.json({ error: { code: 'CHATGPT_REQUIRED', message: 'Continue with ChatGPT in the local companion.' } }, 410));
authRoute.get('/verify', c => c.json({ error: { code: 'CHATGPT_REQUIRED', message: 'Continue with ChatGPT in the local companion.' } }, 410));
authRoute.delete('/account', authMiddleware, async c => {
  await deleteUser(c.env.DB, c.get('user').sub);
  return c.json({ ok: true });
});
authRoute.get('/me', authMiddleware, c => c.json({ id: c.get('user').sub, email: c.get('user').email }));
