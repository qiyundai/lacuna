import { api, type ModelWeights } from '../api.js';
import { sessionVersion } from '../session-version.js';

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
  const version = sessionVersion.value;
  try {
    const data = await api.patterns.get();
    if (version !== sessionVersion.value) return;
    patternsStore.model_weights = data.model_weights;
    patternsStore.last_updated = data.last_updated;
    patternsStore.status = 'loaded';
  } catch {
    if (version !== sessionVersion.value) return;
    patternsStore.status = 'error';
  }
}
