import { getStoredToken, getStoredUser, clearSession } from '../auth.js';
import { entriesStore } from './entries.svelte.js';
import { patternsStore } from './patterns.svelte.js';
import { memoirStore } from './memoir.svelte.js';
import { clearDraft } from './draft.svelte.js';
import { overlayStore } from './overlay.svelte.js';
import { sessionVersion } from '../session-version.js';
import { aiStore } from './ai.svelte.js';

function resetData() {
  sessionVersion.value++;
  entriesStore.entries = []; entriesStore.nextCursor = null; entriesStore.status = 'idle';
  patternsStore.model_weights = null; patternsStore.last_updated = null; patternsStore.status = 'idle';
  memoirStore.prose = null; memoirStore.generated_at = null; memoirStore.status = 'idle';
  clearDraft(); overlayStore.open = false;
  aiStore.provider = 'anthropic'; aiStore.entryCount = 0; aiStore.pending = false; aiStore.companion = null;
}

export type AuthStatus = 'loading' | 'authed' | 'unauthed';

export const session = $state<{
  user: { id: string; email: string } | null;
  status: AuthStatus;
}>({
  user: null,
  status: 'loading',
});

export function hydrateSession(): void {
  const token = getStoredToken();
  const user = getStoredUser();
  if (token && user) {
    session.user = user;
    session.status = 'authed';
  } else {
    session.user = null;
    session.status = 'unauthed';
  }
}

export function setAuthed(user: { id: string; email: string }): void {
  resetData();
  session.user = user;
  session.status = 'authed';
}

export function signOut(): void {
  resetData();
  clearSession();
  session.user = null;
  session.status = 'unauthed';
}
