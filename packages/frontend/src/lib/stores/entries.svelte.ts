import { api, type EntryData } from '../api.js';
import { sessionVersion } from '../session-version.js';

export const entriesStore = $state<{
  entries: EntryData[];
  nextCursor: string | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
}>({
  entries: [],
  nextCursor: null,
  status: 'idle',
});

export async function loadEntries(): Promise<void> {
  if (entriesStore.status === 'loading') return;
  entriesStore.status = 'loading';
  const version = sessionVersion.value;
  try {
    const { entries, nextCursor } = await api.entries.list();
    if (version !== sessionVersion.value) return;
    entriesStore.entries = [...new Map([...entriesStore.entries, ...entries].map(e => [e.id, e])).values()]
      .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
    entriesStore.nextCursor = nextCursor;
    entriesStore.status = 'loaded';
  } catch {
    if (version !== sessionVersion.value) return;
    entriesStore.status = 'error';
  }
}

export async function loadMoreEntries(): Promise<void> {
  if (!entriesStore.nextCursor || entriesStore.status === 'loading') return;
  entriesStore.status = 'loading';
  const version = sessionVersion.value;
  try {
    const { entries, nextCursor } = await api.entries.list(entriesStore.nextCursor);
    if (version !== sessionVersion.value) return;
    entriesStore.entries = [...new Map([...entriesStore.entries, ...entries].map(e => [e.id, e])).values()];
    entriesStore.nextCursor = nextCursor;
    entriesStore.status = 'loaded';
  } catch {
    if (version !== sessionVersion.value) return;
    entriesStore.status = 'error';
  }
}

export function prependEntry(entry: EntryData): void {
  entriesStore.entries = [entry, ...entriesStore.entries.filter(e => e.id !== entry.id)];
}
