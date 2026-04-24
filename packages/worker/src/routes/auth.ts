import { Hono } from 'hono';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { SignJWT } from 'jose';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  consumeChallenge,
  consumeChallengeByUser,
  consumeEmailOTP,
  createCredential,
  createUser,
  deleteUser,
  expireChallenges,
  getCredentialById,
  getUserByEmail,
  getUserByRecoveryHash,
  setRecoveryCodeHash,
  setUserEmail,
  storeChallenge,
  storeEmailOTP,
  updateCredentialSignCount,
} from '../db.js';

type Variables = { user: JwtPayload };
export const authRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function issueJwt(env: Env, userId: string): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT({ sub: userId, email: null })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

function generateOTP(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

async function sendOTPEmail(
  resendApiKey: string | undefined,
  to: string,
  code: string
): Promise<void> {
  if (!resendApiKey) {
    console.log(`[auth] OTP for ${to}: ${code}`);
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
      subject: 'Your Lacuna code',
      html: `<p>Your one-time code for Lacuna:</p><p style="font-size:2rem;letter-spacing:0.2em"><strong>${code}</strong></p><p>Valid for 10 minutes.</p>`,
      text: `Your Lacuna recovery code: ${code}\n\nValid for 10 minutes.`,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

// ── POST /auth/passkey/register-challenge ─────────────────────────────────────
authRoute.post('/passkey/register-challenge', async (c) => {
  await expireChallenges(c.env.DB);

  const user = await createUser(c.env.DB);

  const options = await generateRegistrationOptions({
    rpName: 'Lacuna',
    rpID: new URL(c.env.FRONTEND_ORIGIN).hostname,
    userName: user.id,
    userDisplayName: 'lacuna',
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
    excludeCredentials: [],
  });

  await storeChallenge(c.env.DB, options.challenge, 'registration', user.id);

  return c.json({ options, userId: user.id });
});

// ── POST /auth/passkey/register ───────────────────────────────────────────────
authRoute.post('/passkey/register', async (c) => {
  const body = await c.req.json<{ userId?: string; credential?: unknown }>();
  if (!body.userId || !body.credential) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing fields' } }, 400);
  }

  const challengeRow = await consumeChallengeByUser(c.env.DB, body.userId, 'registration');
  if (!challengeRow) {
    return c.json({ error: { code: 'INVALID_CHALLENGE', message: 'No pending registration' } }, 400);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.credential as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: c.env.FRONTEND_ORIGIN,
      expectedRPID: new URL(c.env.FRONTEND_ORIGIN).hostname,
      requireUserVerification: false,
    });
  } catch (err) {
    console.error('Registration verification failed:', err);
    return c.json({ error: { code: 'VERIFICATION_FAILED', message: 'Passkey registration failed' } }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: { code: 'VERIFICATION_FAILED', message: 'Passkey not verified' } }, 400);
  }

  const { credential } = verification.registrationInfo;
  const publicKeyB64 = isoBase64URL.fromBuffer(credential.publicKey);

  await createCredential(c.env.DB, credential.id, body.userId, publicKeyB64, credential.counter);

  // Generate and store recovery code
  const recoveryCode = generateRecoveryCode();
  const recoveryHash = await sha256Hex(recoveryCode);
  await setRecoveryCodeHash(c.env.DB, body.userId, recoveryHash);

  const jwt = await issueJwt(c.env, body.userId);
  return c.json({ jwt, user: { id: body.userId }, recoveryCode });
});

// ── POST /auth/passkey/auth-challenge ─────────────────────────────────────────
authRoute.post('/passkey/auth-challenge', async (c) => {
  await expireChallenges(c.env.DB);

  const options = await generateAuthenticationOptions({
    rpID: new URL(c.env.FRONTEND_ORIGIN).hostname,
    userVerification: 'preferred',
  });

  await storeChallenge(c.env.DB, options.challenge, 'authentication', null);

  return c.json({ options });
});

// ── POST /auth/passkey/auth ───────────────────────────────────────────────────
authRoute.post('/passkey/auth', async (c) => {
  const body = await c.req.json<{ credential?: { id: string; response: { clientDataJSON: string } } }>();
  if (!body.credential) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing credential' } }, 400);
  }

  let clientChallenge: string;
  try {
    const clientDataJSON = JSON.parse(isoBase64URL.toUTF8String(body.credential.response.clientDataJSON));
    clientChallenge = clientDataJSON.challenge as string;
  } catch {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid credential data' } }, 400);
  }

  const challengeRow = await consumeChallenge(c.env.DB, clientChallenge, 'authentication');
  if (!challengeRow) {
    return c.json({ error: { code: 'INVALID_CHALLENGE', message: 'Challenge expired or invalid' } }, 401);
  }

  const storedCred = await getCredentialById(c.env.DB, body.credential.id);
  if (!storedCred) {
    return c.json({ error: { code: 'UNKNOWN_CREDENTIAL', message: 'Credential not found' } }, 401);
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.credential as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: c.env.FRONTEND_ORIGIN,
      expectedRPID: new URL(c.env.FRONTEND_ORIGIN).hostname,
      requireUserVerification: false,
      credential: {
        id: storedCred.id,
        publicKey: isoBase64URL.toBuffer(storedCred.public_key),
        counter: storedCred.sign_count,
      },
    });
  } catch (err) {
    console.error('Authentication verification failed:', err);
    return c.json({ error: { code: 'VERIFICATION_FAILED', message: 'Authentication failed' } }, 401);
  }

  if (!verification.verified) {
    return c.json({ error: { code: 'VERIFICATION_FAILED', message: 'Authentication not verified' } }, 401);
  }

  await updateCredentialSignCount(
    c.env.DB,
    storedCred.id,
    verification.authenticationInfo.newCounter
  );

  const jwt = await issueJwt(c.env, storedCred.user_id);
  return c.json({ jwt, user: { id: storedCred.user_id } });
});

// ── POST /auth/recovery/email-request ────────────────────────────────────────
authRoute.post('/recovery/email-request', async (c) => {
  const body = await c.req.json<{ email?: string }>();
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid email' } }, 400);
  }

  const user = await getUserByEmail(c.env.DB, email);
  if (user) {
    const code = generateOTP();
    const codeHash = await sha256Hex(code);
    await storeEmailOTP(c.env.DB, user.id, codeHash);
    await sendOTPEmail(c.env.RESEND_API_KEY, email, code);
  }
  // Always return OK to avoid leaking whether the email is registered
  return c.json({ ok: true });
});

// ── POST /auth/recovery/email-verify ─────────────────────────────────────────
authRoute.post('/recovery/email-verify', async (c) => {
  const body = await c.req.json<{ email?: string; code?: string }>();
  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim().replace(/\s/g, '');
  if (!email || !code) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing fields' } }, 400);
  }

  const user = await getUserByEmail(c.env.DB, email);
  if (!user) {
    return c.json({ error: { code: 'INVALID_CODE', message: 'Invalid or expired code' } }, 401);
  }

  const codeHash = await sha256Hex(code);
  const valid = await consumeEmailOTP(c.env.DB, user.id, codeHash);
  if (!valid) {
    return c.json({ error: { code: 'INVALID_CODE', message: 'Invalid or expired code' } }, 401);
  }

  const jwt = await issueJwt(c.env, user.id);
  return c.json({ jwt, user: { id: user.id } });
});

// ── POST /auth/recovery/code-verify ──────────────────────────────────────────
authRoute.post('/recovery/code-verify', async (c) => {
  const body = await c.req.json<{ code?: string }>();
  const code = body.code?.trim().replace(/[-\s]/g, '').toUpperCase();
  if (!code) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing code' } }, 400);
  }

  // Support both raw and formatted (XXXX-XXXX-XXXX-XXXX) codes
  const formatted = code.length === 16
    ? `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`
    : body.code!.trim().toUpperCase();

  const codeHash = await sha256Hex(formatted);
  const user = await getUserByRecoveryHash(c.env.DB, codeHash);
  if (!user) {
    return c.json({ error: { code: 'INVALID_CODE', message: 'Invalid recovery code' } }, 401);
  }

  // Rotate: generate a new recovery code immediately
  const newCode = generateRecoveryCode();
  const newHash = await sha256Hex(newCode);
  await setRecoveryCodeHash(c.env.DB, user.id, newHash);

  const jwt = await issueJwt(c.env, user.id);
  return c.json({ jwt, user: { id: user.id }, newRecoveryCode: newCode });
});

// ── PATCH /auth/email ─────────────────────────────────────────────────────────
authRoute.patch('/email', authMiddleware, async (c) => {
  const jwtUser = c.get('user');
  const body = await c.req.json<{ email?: string }>();
  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid email' } }, 400);
  }

  const existing = await getUserByEmail(c.env.DB, email);
  if (existing && existing.id !== jwtUser.sub) {
    return c.json({ error: { code: 'EMAIL_TAKEN', message: 'Email already in use' } }, 409);
  }

  await setUserEmail(c.env.DB, jwtUser.sub, email);
  return c.json({ ok: true });
});

// ── DELETE /auth/account ──────────────────────────────────────────────────────
authRoute.delete('/account', authMiddleware, async (c) => {
  const user = c.get('user');
  await deleteUser(c.env.DB, user.sub);
  return c.json({ ok: true });
});
