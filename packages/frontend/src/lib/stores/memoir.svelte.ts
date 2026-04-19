import { api } from '../api.js';

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
  try {
    const data = await api.memoir.get();
    memoirStore.prose = data?.prose ?? null;
    memoirStore.generated_at = data?.generated_at ?? null;
    memoirStore.status = 'loaded';
  } catch {
    memoirStore.status = 'error';
  }
}
