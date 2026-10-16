import { api } from '../api.js';
import { sessionVersion } from '../session-version.js';

export const memoirStore = $state<{
  prose: string | null;
  generated_at: number | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
}>({
  prose: null,
  generated_at: null,
  status: 'idle',
});

export async function loadMemoir(): Promise<void> {
  if (memoirStore.status === 'loading') return;
  memoirStore.status = 'loading';
  const version = sessionVersion.value;
  try {
    const data = await api.memoir.get();
    if (version !== sessionVersion.value) return;
    memoirStore.prose = data?.prose ?? null;
    memoirStore.generated_at = data?.generated_at ?? null;
    memoirStore.status = 'loaded';
  } catch {
    if (version !== sessionVersion.value) return;
    memoirStore.status = 'error';
  }
}
