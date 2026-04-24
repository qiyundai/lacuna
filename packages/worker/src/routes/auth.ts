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
  createCredential,
  createUser,
  deleteUser,
  expireChallenges,
  getCredentialById,
  storeChallenge,
  updateCredentialSignCount,
} from '../db.js';

type Variables = { user: JwtPayload };
export const authRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

async function issueJwt(env: Env, userId: string): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT({ sub: userId, email: null })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

// ── POST /auth/passkey/register-challenge ─────────────────────────────────────
authRoute.post('/passkey/register-challenge', async (c) => {
  await expireChallenges(c.env.DB);

  const user = await createUser(c.env.DB);

  const options = await generateRegistrationOptions({
    rpName: 'Lacuna',
    rpID: c.env.RP_ID,
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
      expectedRPID: c.env.RP_ID,
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
  // credential.id is already a Base64URLString; credential.publicKey is Uint8Array
  const publicKeyB64 = isoBase64URL.fromBuffer(credential.publicKey);

  await createCredential(c.env.DB, credential.id, body.userId, publicKeyB64, credential.counter);

  const jwt = await issueJwt(c.env, body.userId);
  return c.json({ jwt, user: { id: body.userId } });
});

// ── POST /auth/passkey/auth-challenge ─────────────────────────────────────────
authRoute.post('/passkey/auth-challenge', async (c) => {
  await expireChallenges(c.env.DB);

  const options = await generateAuthenticationOptions({
    rpID: c.env.RP_ID,
    userVerification: 'preferred',
    // No allowCredentials → discoverable: browser shows its own passkey picker
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

  // Extract the challenge from clientDataJSON to look up our stored challenge row
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
      expectedRPID: c.env.RP_ID,
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

// ── DELETE /auth/account ──────────────────────────────────────────────────────
authRoute.delete('/account', authMiddleware, async (c) => {
  const user = c.get('user');
  await deleteUser(c.env.DB, user.sub);
  return c.json({ ok: true });
});
