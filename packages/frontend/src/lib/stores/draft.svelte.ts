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

export function appendText(char: string): void {
  draft.chars.push({ id: nextId++, ch: char, bornAt: performance.now() });
  draft.text += char;
  draft.isDirty = draft.text.length > 0;
}

export function insertAt(pos: number, text: string): void {
  const now = performance.now();
  const newChars = [...text].map(ch => ({ id: nextId++, ch, bornAt: now }));
  draft.chars.splice(pos, 0, ...newChars);
  draft.text = draft.chars.map(c => c.ch).join('');
  draft.isDirty = draft.text.length > 0;
}

export function deleteRange(start: number, end: number): void {
  draft.chars.splice(start, end - start);
  draft.text = draft.chars.map(c => c.ch).join('');
  draft.isDirty = draft.text.length > 0;
}

export function deleteChar(): void {
  draft.chars.pop();
  draft.text = draft.text.slice(0, -1);
  draft.isDirty = draft.text.length > 0;
}

export function clearDraft(): void {
  draft.chars = [];
  draft.text = '';
  draft.isDirty = false;
}
