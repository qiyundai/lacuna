import { api } from '../api.js';
import { sessionVersion } from '../session-version.js';
export const aiStore = $state<{ provider: 'chatgpt'; pending: boolean; entryCount: number }>({ provider: 'chatgpt', pending: false, entryCount: 0 });
let latestLoad = 0;
export async function loadAI(): Promise<void> {
  const version = sessionVersion.value;
  const load = ++latestLoad;
  const status = await api.ai.status();
  if (version !== sessionVersion.value || load !== latestLoad) return;
  aiStore.provider = status.provider; aiStore.pending = !!status.pending; aiStore.entryCount = status.entryCount;
}
