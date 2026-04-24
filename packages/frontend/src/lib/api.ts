import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

const BASE = import.meta.env.VITE_API_URL ?? (
  import.meta.env.DEV ? 'http://localhost:8787' : 'https://lacuna-api.pianoquin4126.workers.dev'
);

function getToken(): string | null {
  return localStorage.getItem('lacuna_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error((body as { error?: { message?: string } }).error?.message ?? 'Request failed'), {
      status: res.status,
      code: (body as { error?: { code?: string } }).error?.code,
    });
  }
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    passkey: {
      registerChallenge: () =>
        request<{ options: PublicKeyCredentialCreationOptionsJSON; userId: string }>(
          '/auth/passkey/register-challenge', { method: 'POST', body: '{}' }, false
        ),
      register: (userId: string, credential: RegistrationResponseJSON) =>
        request<{ jwt: string; user: { id: string }; recoveryCode: string }>(
          '/auth/passkey/register',
          { method: 'POST', body: JSON.stringify({ userId, credential }) },
          false
        ),
      authChallenge: () =>
        request<{ options: PublicKeyCredentialRequestOptionsJSON }>(
          '/auth/passkey/auth-challenge', { method: 'POST', body: '{}' }, false
        ),
      auth: (credential: AuthenticationResponseJSON) =>
        request<{ jwt: string; user: { id: string } }>(
          '/auth/passkey/auth',
          { method: 'POST', body: JSON.stringify({ credential }) },
          false
        ),
    },
    recovery: {
      emailRequest: (email: string) =>
        request<{ ok: boolean }>(
          '/auth/recovery/email-request',
          { method: 'POST', body: JSON.stringify({ email }) },
          false
        ),
      emailVerify: (email: string, code: string) =>
        request<{ jwt: string; user: { id: string } }>(
          '/auth/recovery/email-verify',
          { method: 'POST', body: JSON.stringify({ email, code }) },
          false
        ),
      codeVerify: (code: string) =>
        request<{ jwt: string; user: { id: string }; newRecoveryCode: string }>(
          '/auth/recovery/code-verify',
          { method: 'POST', body: JSON.stringify({ code }) },
          false
        ),
    },
    setEmail: (email: string) =>
      request<{ ok: boolean }>('/auth/email', {
        method: 'PATCH',
        body: JSON.stringify({ email }),
      }),
    deleteAccount: () =>
      request<{ ok: boolean }>('/auth/account', { method: 'DELETE' }),
  },
  entries: {
    list: (cursor?: string) =>
      request<{ entries: EntryData[]; nextCursor: string | null }>(
        `/entries${cursor ? `?cursor=${cursor}` : ''}`
      ),
    create: (body: string, solidified_at: number) =>
      request<{ entry: EntryData }>('/entries', {
        method: 'POST',
        body: JSON.stringify({ body, solidified_at }),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/entries/${id}`, { method: 'DELETE' }),
  },
  patterns: {
    get: () => request<{ model_weights: ModelWeights; last_updated: number | null }>('/patterns'),
    patch: (model_weights: ModelWeights) =>
      request<{ ok: boolean }>('/patterns', {
        method: 'PATCH',
        body: JSON.stringify({ model_weights }),
      }),
  },
  memoir: {
    get: () => request<{ prose: string; generated_at: number } | null>('/memoir'),
  },
};

export interface EntryData {
  id: string;
  user_id: string;
  body: string;
  created_at: number;
  solidified_at: number | null;
}

export interface ModelWeights {
  story_thread?: number;
  voices?: number;
  blind_spots?: number;
  unsaid?: number;
  story_loop?: number;
  where_you_are?: number;
  acknowledgment?: string;
  narrative_tone?: string;
  emerging_theme?: string;
  overall_tone?: string;
  summaries?: Record<string, string>;
}
