import { api, type ModelWeights } from '../api.js';

export const patternsStore = $state<{
  model_weights: ModelWeights | null;
  last_updated: number | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
}>({
  model_weights: null,
  last_updated: null,
  status: 'idle',
});

export async function loadPatterns(): Promise<void> {
  if (patternsStore.status === 'loading') return;
  patternsStore.status = 'loading';
  try {
    const data = await api.patterns.get();
    patternsStore.model_weights = data.model_weights;
    patternsStore.last_updated = data.last_updated;
    patternsStore.status = 'loaded';
  } catch {
    patternsStore.status = 'error';
  }
}
