import { Hono } from 'hono';
import { SignJWT } from 'jose';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  clearMagicToken,
  deleteUser,
  getUserByMagicToken,
  setMagicToken,
  upsertUser,
} from '../db.js';

type Variables = { user: JwtPayload };
export const authRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

authRoute.post('/request', async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid email' } }, 400);
  }

  const user = await upsertUser(c.env.DB, email);
  const token = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60; // 15 minutes
  await setMagicToken(c.env.DB, user.id, token, expiresAt);

  await sendMagicLinkEmail(c.env.RESEND_API_KEY, c.env.FRONTEND_ORIGIN, email, token);

  return c.json({ ok: true });
});

authRoute.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing token' } }, 400);
  }

  const user = await getUserByMagicToken(c.env.DB, token);
  if (!user || !user.magic_token_expires_at) {
    return c.json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired link' } }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > user.magic_token_expires_at) {
    await clearMagicToken(c.env.DB, user.id);
    return c.json({ error: { code: 'EXPIRED_TOKEN', message: 'Link has expired' } }, 401);
  }

  await clearMagicToken(c.env.DB, user.id);

  const secret = new TextEncoder().encode(c.env.JWT_SECRET);
  const jwt = await new SignJWT({ sub: user.id, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

  return c.json({ jwt, user: { id: user.id, email: user.email } });
});

authRoute.delete('/account', authMiddleware, async (c) => {
  const user = c.get('user');
  await deleteUser(c.env.DB, user.sub);
  return c.json({ ok: true });
});

async function sendMagicLinkEmail(
  resendApiKey: string,
  frontendOrigin: string,
  to: string,
  token: string
): Promise<void> {
  const link = `${frontendOrigin}/auth/verify?token=${encodeURIComponent(token)}`;

  if (!resendApiKey) {
    // Local dev fallback: no Resend key configured, so log the magic link
    // to the worker console instead of sending an email.
    console.log(`[auth] magic link for ${to}: ${link}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Lacuna <noreply@quietatlas.io>',
      to,
      subject: 'Open Lacuna',
      html: `<p>Your link to enter Lacuna:</p><p><a href="${link}">${link}</a></p><p>Valid for 15 minutes.</p>`,
      text: `Open Lacuna: ${link}\n\nValid for 15 minutes.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}
