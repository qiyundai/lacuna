import { api, isCompanion } from '../api.js';
import { readLocal } from '../storage.js';
import { sessionVersion } from '../session-version.js';
export interface CompanionStatus { connected: boolean; email: string | null; model: string | null; state: string; code: string | null; message: string }
export const aiStore = $state<{ provider: 'anthropic' | 'chatgpt'; pending: boolean; entryCount: number; companion: CompanionStatus | null }>({ provider: 'anthropic', pending: false, entryCount: 0, companion: null });
let latestLoad = 0;
export async function companionRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/companion/${path}`, { method, headers: { Authorization: `Bearer ${readLocal('lacuna_token')}`, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(30000) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? 'Companion request failed');
  return value;
}
export async function loadAI(): Promise<void> {
  const version = sessionVersion.value;
  const load = ++latestLoad;
  const [status, local] = await Promise.all([
    api.ai.status(),
    isCompanion ? companionRequest<CompanionStatus>('status') : Promise.resolve(null),
  ]);
  if (version !== sessionVersion.value || load !== latestLoad) return;
  aiStore.provider = status.provider; aiStore.pending = !!status.pending; aiStore.entryCount = status.entryCount;
  aiStore.companion = local;
}
