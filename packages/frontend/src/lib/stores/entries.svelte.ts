import { api, type EntryData } from '../api.js';

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
  try {
    const { entries, nextCursor } = await api.entries.list();
    entriesStore.entries = entries;
    entriesStore.nextCursor = nextCursor;
    entriesStore.status = 'loaded';
  } catch {
    entriesStore.status = 'error';
  }
}

export async function loadMoreEntries(): Promise<void> {
  if (!entriesStore.nextCursor || entriesStore.status === 'loading') return;
  entriesStore.status = 'loading';
  try {
    const { entries, nextCursor } = await api.entries.list(entriesStore.nextCursor);
    entriesStore.entries = [...entriesStore.entries, ...entries];
    entriesStore.nextCursor = nextCursor;
    entriesStore.status = 'loaded';
  } catch {
    entriesStore.status = 'error';
  }
}

export function prependEntry(entry: EntryData): void {
  entriesStore.entries = [entry, ...entriesStore.entries];
}
