export type DraftChar = { id: number; ch: string; bornAt: number };

export const draft = $state<{
  text: string;
  chars: DraftChar[];
  isDirty: boolean;
}>({
  text: '',
  chars: [],
  isDirty: false,
});

let nextId = 0;

export function insertAt(pos: number, text: string): void {
  const now = performance.now();
  const newChars = [...text].map(ch => ({ id: nextId++, ch, bornAt: now }));
  const index = [...draft.text.slice(0, pos)].length;
  draft.chars.splice(index, 0, ...newChars);
  draft.text = draft.chars.map(c => c.ch).join('');
  draft.isDirty = draft.text.length > 0;
}

export function deleteRange(start: number, end: number): void {
  const index = [...draft.text.slice(0, start)].length;
  draft.chars.splice(index, [...draft.text.slice(start, end)].length);
  draft.text = draft.chars.map(c => c.ch).join('');
  draft.isDirty = draft.text.length > 0;
}

export function clearDraft(): void {
  draft.chars = [];
  draft.text = '';
  draft.isDirty = false;
}
