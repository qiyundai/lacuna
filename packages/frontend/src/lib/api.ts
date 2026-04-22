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
    request: (email: string) =>
      request<{ ok: boolean }>('/auth/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }, false),
    verify: (token: string) =>
      request<{ jwt: string; user: { id: string; email: string } }>(
        `/auth/verify?token=${encodeURIComponent(token)}`,
        {},
        false
      ),
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
