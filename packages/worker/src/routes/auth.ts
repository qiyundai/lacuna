import { Hono } from 'hono';
import { SignJWT } from 'jose';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  deleteUser,
  consumeMagicToken,
  setMagicToken,
  upsertUser,
} from '../db.js';
import { checkRateLimit } from '../ratelimit.js';

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

type Variables = { user: JwtPayload };
export const authRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

authRoute.post('/request', async (c) => {
  const body = await c.req.json<{ email?: unknown; consent?: unknown; companionOrigin?: unknown }>();
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || body?.consent !== true) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid email' } }, 400);
  }
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  if (!await checkRateLimit(c.env.DB, `auth-ip:${ip}`, 20, 900) ||
      !await checkRateLimit(c.env.DB, `auth-email:${await hashToken(email)}`, 3, 900)) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Please wait before requesting another link' } }, 429);
  }
  if (!c.env.RESEND_API_KEY && c.env.ALLOW_DEV_AUTH !== 'true') {
    return c.json({ error: { code: 'UNAVAILABLE', message: 'Email sign-in is not configured' } }, 503);
  }

  const user = await upsertUser(c.env.DB, email);
  const token = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60; // 15 minutes
  await setMagicToken(c.env.DB, user.id, await hashToken(token), expiresAt);

  let returnOrigin = c.env.FRONTEND_ORIGIN;
  if (body.companionOrigin !== undefined) {
    try {
      const origin = new URL(String(body.companionOrigin));
      if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid origin');
      returnOrigin = origin.origin;
    } catch { return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid companion address' } }, 400); }
  }
  await sendMagicLinkEmail(c.env.RESEND_API_KEY, returnOrigin, email, token);

  return c.json({ ok: true });
});

authRoute.get('/verify', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing token' } }, 400);
  }

  const user = await consumeMagicToken(c.env.DB, await hashToken(token));
  if (!user) {
    return c.json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired link' } }, 401);
  }

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

authRoute.get('/me', authMiddleware, c => c.json({ id: c.get('user').sub, email: c.get('user').email }));

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
    throw new Error(`Email delivery failed (${res.status})`);
  }
}
