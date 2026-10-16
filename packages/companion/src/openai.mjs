import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const TOKEN_ENDPOINT = `${ISSUER}/api/accounts/oauth/token`;
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
export class PlanError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function failure(code) {
  if (['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable', 'rate_limit_exceeded'].includes(code)) return new PlanError('USAGE_LIMIT', 'ChatGPT usage is unavailable or a limit was reached. Manage usage in ChatGPT settings.');
  if (['invalid_grant', 'invalid_token', 'token_expired'].includes(code)) return new PlanError('RECONNECT', 'Your ChatGPT session needs to be connected again.');
  return new PlanError('INFERENCE_FAILED', 'The ChatGPT request did not complete. Try again.');
}
export function createAuthorization(hostId, redirectUri, registration) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const clientId = registration?.client_id ?? 'dynamic_agent_client';
  const params = new URLSearchParams({ client_id: clientId, ext_agent_host_id: hostId, response_type: 'code', redirect_uri: redirectUri,
    scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: RESOURCE,
    state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
  if (clientId === 'dynamic_agent_client') params.set('agent_name_hint', 'Lacuna');
  else if (registration?.id_token) params.set('id_token_hint', registration.id_token);
  return { url: `${ISSUER}/api/accounts/authorize?${params}`, state, nonce, verifier, clientId, subject: registration?.subject, redirectUri, expires: Date.now() + 600000 };
}
async function tokenRequest(params, fetchImpl = fetch) {
  const res = await fetchImpl(TOKEN_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(30000) });
  const value = await res.json();
  if (!res.ok) throw failure(value.error);
  if (typeof value.access_token !== 'string' || !value.access_token || value.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(value.expires_in) || value.expires_in <= 0) throw new PlanError('RECONNECT', 'OpenAI returned an invalid session. Connect again.');
  return value;
}
export async function exchangeCode(pending, params, { fetchImpl = fetch, keySet = jwks } = {}) {
  if (params.get('state') !== pending.state || Date.now() >= pending.expires) throw new PlanError('INVALID_CALLBACK', 'Sign-in expired or could not be verified. Connect again.');
  if (params.has('error')) throw new PlanError('CONSENT_DECLINED', 'ChatGPT sign-in was declined. You can connect again from settings.');
  const returned = params.get('client_id');
  const clientId = pending.clientId === 'dynamic_agent_client' ? returned : pending.clientId;
  if (!clientId || clientId === 'dynamic_agent_client' || (pending.clientId !== 'dynamic_agent_client' && returned && returned !== clientId) || !params.get('code')) throw new PlanError('INVALID_CALLBACK', 'Sign-in registration did not complete.');
  const token = await tokenRequest({ grant_type: 'authorization_code', client_id: clientId, code: params.get('code'), code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: RESOURCE }, fetchImpl);
  const { payload } = await jwtVerify(token.id_token, keySet, { issuer: ISSUER, audience: clientId, requiredClaims: ['sub', 'exp', 'iat', 'nonce'], algorithms: ['RS256', 'ES256'] });
  if (payload.nonce !== pending.nonce || typeof payload.sub !== 'string' || (pending.subject && payload.sub !== pending.subject)) throw new PlanError('INVALID_IDENTITY', 'The returned ChatGPT account did not match this connection.');
  const scopes = typeof token.scope === 'string' ? token.scope.split(/\s+/) : [];
  if (!scopes.includes('chatgpt.tokens.use.direct') || !scopes.includes('resource.invoke')) throw new PlanError('PLAN_DISABLED', 'ChatGPT plan usage was not granted. Connect again and allow plan use.');
  return { ...token, client_id: clientId, subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : 'ChatGPT account', scopes, expiresAt: Date.now() + token.expires_in * 1000 };
}
export class OpenAIPlan {
  constructor(store, fetchImpl = fetch) { this.store = store; this.fetch = fetchImpl; this.refreshing = new Map(); this.disconnecting = new Set(); }
  async access(userId) {
    if (this.disconnecting.has(userId)) throw failure('invalid_grant');
    const profile = this.store.data.profiles[userId];
    if (!profile) throw new PlanError('RECONNECT', 'Continue with ChatGPT to connect your plan.');
    if (profile.expiresAt > Date.now() + 60000) return profile.access_token;
    if (this.refreshing.has(userId)) return this.refreshing.get(userId);
    const promise = this.refresh(userId, profile).finally(() => this.refreshing.delete(userId));
    this.refreshing.set(userId, promise);
    return promise;
  }
  async refresh(userId, profile) {
    if (!profile.refresh_token) throw failure('invalid_grant');
    const token = await tokenRequest({ grant_type: 'refresh_token', client_id: profile.client_id, refresh_token: profile.refresh_token, resource: RESOURCE }, this.fetch);
    if (this.store.data.profiles[userId] !== profile) throw failure('invalid_grant');
    const scopes = typeof token.scope === 'string' ? token.scope.split(/\s+/) : profile.scopes;
    if (!scopes.includes('chatgpt.tokens.use.direct') || !scopes.includes('resource.invoke')) throw failure('invalid_grant');
    const updated = { ...profile, ...token, refresh_token: token.refresh_token ?? profile.refresh_token, scopes, expiresAt: Date.now() + token.expires_in * 1000 };
    this.store.data.profiles[userId] = updated;
    await this.store.save();
    return updated.access_token;
  }
  async models(userId) {
    const res = await this.fetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${await this.access(userId)}` }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw res.status === 401 ? failure('invalid_token') : failure('models_failed');
    const data = await res.json();
    return (Array.isArray(data.models) ? data.models : []).filter(m => m.visibility === 'list' && typeof m.slug === 'string' && typeof m.display_name === 'string').map(m => ({ slug: m.slug, name: m.display_name }));
  }
  async generate(userId, model, prompt, signal) {
    const res = await this.fetch(`${RESOURCE}/responses`, { method: 'POST', signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(90000)]),
      headers: { Authorization: `Bearer ${await this.access(userId)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions: prompt.system, input: [{ role: 'user', content: prompt.user }], store: false, stream: true }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw res.status === 401 ? failure('invalid_token') : res.status === 429 ? failure('rate_limit_exceeded') : failure(data.error?.code);
    }
    return consumeResponse(res);
  }
  async disconnect(userId) {
    this.disconnecting.add(userId);
    await this.refreshing.get(userId)?.catch(() => {});
    const profile = this.store.data.profiles[userId];
    const registration = this.store.data.registrations[userId];
    delete this.store.data.profiles[userId];
    delete this.store.data.registrations[userId];
    try { await this.store.save(); }
    catch {
      if (profile) this.store.data.profiles[userId] = profile;
      if (registration) this.store.data.registrations[userId] = registration;
      this.disconnecting.delete(userId);
      throw new PlanError('DISCONNECT_FAILED', 'Could not clear the protected credentials. Try disconnecting again.');
    }
    this.disconnecting.delete(userId);
    if (!profile?.refresh_token) return true;
    try {
      const discovery = await this.fetch(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) });
      const config = await discovery.json();
      const endpoint = new URL(config.revocation_endpoint);
      if (!discovery.ok || config.issuer !== ISSUER || endpoint.origin !== ISSUER) return false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await this.fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: profile.refresh_token, token_type_hint: 'refresh_token', client_id: profile.client_id }), signal: AbortSignal.timeout(10000) });
          if (res.status === 200) return true;
          if (res.status < 500) return false;
        } catch { /* Retry a transient network failure while the captured token remains available. */ }
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 250));
      }
    } catch { /* Local tokens are cleared even when remote revocation is unavailable. */ }
    return false;
  }
}
export async function consumeResponse(response) {
  if (!response.body) throw failure('missing_stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', output = '', completed = false;
  function event(block) {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let value;
    try { value = JSON.parse(data); } catch { throw failure('invalid_stream'); }
    if (value.type === 'response.output_text.delta') { output += value.delta ?? ''; if (output.length > 100000) throw failure('oversized_response'); }
    if (['response.failed', 'response.incomplete', 'error'].includes(value.type)) throw failure(value.response?.error?.code ?? value.error?.code ?? value.code);
    if (value.type === 'response.completed') { if (value.response?.status && value.response.status !== 'completed') throw failure('incomplete'); completed = true; }
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) { event(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
      if (buffer.length > 200000) throw failure('oversized_event');
      if (done) { if (buffer.trim()) event(buffer); break; }
    }
    if (!completed || !output) throw failure('interrupted');
    return output;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
