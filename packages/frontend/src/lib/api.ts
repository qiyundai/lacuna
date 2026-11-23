import type { Trace, VillageEntry } from '../../../shared/village.js';
import type { ForgottenAddress } from '../../../shared/city-address.js';
import type { Book } from '../../../shared/living-book.js';
import { sessionVersion } from './session-version.js';
import { defaultApiOrigin } from '../../../shared/sync-packet.js';
import type { RiverClock, Settlement } from '../../../shared/river.js';
export const apiBase = import.meta.env.VITE_API_URL ?? (
  import.meta.env.DEV ? 'http://localhost:8787' : defaultApiOrigin
);

// Journal operations run entirely in this browser against the encrypted vault.
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const version = sessionVersion.value;
  try { const { webRequest } = await import('./web-api.js'); return await webRequest(path, options.method ?? 'GET', typeof options.body === 'string' ? JSON.parse(options.body) : undefined) as T; }
  catch (error) { if (version === sessionVersion.value && (error as { code?: string }).code === 'VAULT_LOCKED') window.dispatchEvent(new Event('lacuna:locked')); throw error; }
}

export const api = {
  village: {
    get: () => request<{entries: EntryData[]}>('/village'),
    revise: (entry:string,separate:boolean) => request<{entries:EntryData[]}>('/village/thread',{method:'POST',body:JSON.stringify({entry,separate})}),
    remember: (entry: string, action: Trace) => request<{entries: EntryData[]}>('/village/encounter', {method: 'POST', body: JSON.stringify({entry,action})})
  },
  town: {
    get: () => request<{ entries: EntryData[]; clock: RiverClock }>('/town'),
    nextDay: (day: number) => request<{ entries: EntryData[]; clock: RiverClock }>('/town/day', { method: 'POST', body: JSON.stringify({ day }) })
  },
  auth: {
    deleteAccount: () =>
      request<{ ok: boolean }>('/auth/account', { method: 'DELETE' }),
  },
  city: {
    get: () => request<{entries:EntryData[];forgotten:ForgottenAddress[]}>('/city'),
    write: (body:string, solidified_at:number, entry_id:string) => request<{entry:EntryData}>('/entries', {method:'POST',body:JSON.stringify({body,solidified_at,entry_id,city:true})}),
  },
  entries: {
    list: (cursor?: string, filter: { query?: string; kept?: boolean } = {}) =>
      request<{ entries: EntryData[]; nextCursor: string | null }>(
        `/entries?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(filter.query ? { q: filter.query } : {}), ...(filter.kept ? { kept: '1' } : {}) })}`
      ),
    create: (body: string, solidified_at: number, entry_id: string, settlement?: Settlement) =>
      request<{ entry: EntryData }>('/entries', {
        method: 'POST',
        body: JSON.stringify({ body, solidified_at, entry_id, settlement }),
      }),
    forget: (id: string) =>
      request<{ ok: boolean; address:ForgottenAddress }>(`/entries/${id}`, { method: 'DELETE' }),
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
  },
};

export interface EntryData extends VillageEntry {
  writingDay?:number;
  riverEdition?: 2 | 3;
  settlement?: Settlement;
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
export interface ArchiveData { format: string; exported_at: string; entries: EntryData[]; memoirs: MemoirEdition[]; book?:Book; [key: string]: unknown }

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
