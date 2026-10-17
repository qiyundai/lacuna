import { sessionVersion } from './session-version.js';
export const isCompanion = typeof document !== 'undefined' && document.querySelector('meta[name="lacuna-companion"]') !== null;
const BASE = isCompanion ? '/api' : import.meta.env.VITE_API_URL ?? (
  import.meta.env.DEV ? 'http://localhost:8787' : 'https://lacuna-api.pianoquin4126.workers.dev'
);

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true
): Promise<T> {
  const version = sessionVersion.value;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, credentials: 'same-origin', headers, signal: options.signal ?? AbortSignal.timeout(30000) });
  if (!res.ok) {
    if (version === sessionVersion.value && auth && res.status === 401) window.dispatchEvent(new Event('lacuna:unauthorized'));
    if (version === sessionVersion.value && res.status === 423) window.dispatchEvent(new Event('lacuna:locked'));
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
    logout: () => request<{ ok: boolean; revoked: boolean; openaiRevoked: boolean }>('/auth/logout', { method: 'POST' }),
    deleteAccount: () =>
      request<{ ok: boolean }>('/auth/account', { method: 'DELETE' }),
  },
  entries: {
    list: (cursor?: string, filter: { query?: string; kept?: boolean } = {}) =>
      request<{ entries: EntryData[]; nextCursor: string | null }>(
        `/entries?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(filter.query ? { q: filter.query } : {}), ...(filter.kept ? { kept: '1' } : {}) })}`
      ),
    create: (body: string, solidified_at: number, entry_id: string) =>
      request<{ entry: EntryData }>('/entries', {
        method: 'POST',
        body: JSON.stringify({ body, solidified_at, entry_id }),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/entries/${id}`, { method: 'DELETE' }),
    keep: (id: string, kept: boolean) => request<{ entry: EntryData }>(`/entries/${id}/keep`, { method: 'PATCH', body: JSON.stringify({ kept }) }),
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
    get: () => request<MemoirEdition | null>('/memoir'),
    history: (cursor?: string) => request<{ editions: MemoirEdition[]; nextCursor: string | null }>(`/memoir/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  },
  story: {
    get: () => request<StoryData>('/story'),
    export: () => request<ArchiveData>('/story/export'),
  },
  ai: {
    status: () => request<{ provider: 'chatgpt'; pending: number; entryCount: number }>('/ai/status'),
    refresh: () => request('/ai/refresh', { method: 'POST' }),
  },
};

export interface EntryData {
  id: string;
  user_id: string;
  body: string;
  created_at: number;
  solidified_at: number | null;
  kept_at: number | null;
}

export interface MemoryNode { concept: string; type: 'theme' | 'emotion' | 'entity'; weight: number; count: number }
export interface MemoirEdition { id: string; prose: string; generated_at: number }
export interface StoryData {
  summary: { total: number; kept: number; first_at: number | null; last_at: number | null };
  graph: { nodes: MemoryNode[]; processed_count: number };
}
export interface ArchiveData { format: string; exported_at: string; entries: EntryData[]; memoirs: MemoirEdition[]; [key: string]: unknown }

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
