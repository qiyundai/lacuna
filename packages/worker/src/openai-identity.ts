import { createRemoteJWKSet, jwtVerify } from 'jose';

export const OPENAI_ISSUER = 'https://auth.openai.com';
const keys = createRemoteJWKSet(new URL(`${OPENAI_ISSUER}/.well-known/jwks.json`));

// Bind the verified identity to the nonce minted by Lacuna for this sign-in.
export async function verifyOpenAIIdentity(idToken: string, clientId: string, nonce: string, keySet = keys) {
  const { payload } = await jwtVerify(idToken, keySet, {
    issuer: OPENAI_ISSUER, audience: clientId, algorithms: ['RS256', 'ES256'],
    requiredClaims: ['sub', 'exp', 'iat', 'nonce'], maxTokenAge: '10m',
  });
  if (payload.nonce !== nonce || typeof payload.sub !== 'string' || !payload.sub || (payload.azp && payload.azp !== clientId)) throw new Error('Invalid OpenAI identity');
  return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : 'ChatGPT account' };
}
