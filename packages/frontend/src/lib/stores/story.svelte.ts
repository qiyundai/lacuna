import { api, type StoryData } from '../api.js';
import { sessionVersion } from '../session-version.js';
export const storyStore = $state<{ data: StoryData | null; status: 'idle' | 'loading' | 'loaded' | 'error' }>({ data: null, status: 'idle' });
let latest = 0;
export async function loadStory() {
  const request = ++latest, version = sessionVersion.value;
  storyStore.status = 'loading';
  try {
    const data = await api.story.get();
    if (version !== sessionVersion.value || request !== latest) return;
    storyStore.data = data; storyStore.status = 'loaded';
  } catch {
    if (version === sessionVersion.value && request === latest) storyStore.status = 'error';
  }
}
