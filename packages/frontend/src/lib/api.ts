import { readLocal } from './storage.js';
export const isCompanion = typeof document !== 'undefined' && document.querySelector('meta[name="lacuna-companion"]') !== null;
const BASE = isCompanion ? '/api' : import.meta.env.VITE_API_URL ?? (
  import.meta.env.DEV ? 'http://localhost:8787' : 'https://lacuna-api.pianoquin4126.workers.dev'
);

function getToken(): string | null {
  return readLocal('lacuna_token');
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
  const tokenAtStart = getToken();
  const res = await fetch(`${BASE}${path}`, { ...options, headers, signal: options.signal ?? AbortSignal.timeout(30000) });
  if (!res.ok) {
    if (auth && res.status === 401 && tokenAtStart === getToken()) window.dispatchEvent(new Event('lacuna:unauthorized'));
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
    request: (email: string) =>
      request<{ ok: boolean }>('/auth/request', {
        method: 'POST',
        body: JSON.stringify({ email, consent: true, ...(isCompanion ? { companionOrigin: location.origin } : {}) }),
      }, false),
    verify: (token: string) =>
      request<{ jwt: string; user: { id: string; email: string } }>(
        `/auth/verify?token=${encodeURIComponent(token)}`,
        {},
        false
      ),
    deleteAccount: () =>
      request<{ ok: boolean }>('/auth/account', { method: 'DELETE' }),
  },
  entries: {
    list: (cursor?: string) =>
      request<{ entries: EntryData[]; nextCursor: string | null }>(
        `/entries${cursor ? `?cursor=${cursor}` : ''}`
      ),
    create: (body: string, solidified_at: number, entry_id: string) =>
      request<{ entry: EntryData }>('/entries', {
        method: 'POST',
        body: JSON.stringify({ body, solidified_at, entry_id }),
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
  ai: {
    status: () => request<{ provider: 'anthropic' | 'chatgpt'; pending: number; entryCount: number }>('/ai/status'),
    provider: (provider: 'anthropic' | 'chatgpt') => request('/ai/provider', { method: 'PATCH', body: JSON.stringify({ provider }) }),
    refresh: () => request('/ai/refresh', { method: 'POST' }),
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
