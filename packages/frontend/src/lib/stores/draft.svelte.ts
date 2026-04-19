import { placeWord } from '../utils/wordcloud.js';

export interface WordPosition {
  word: string;
  x: number; // vw percent
  y: number; // vh percent
  delay: number; // animation delay ms
  key: number;
}

export const draft = $state<{
  text: string;
  words: WordPosition[];
  isDirty: boolean;
}>({
  text: '',
  words: [],
  isDirty: false,
});

let wordKey = 0;
let lastWordCount = 0;

export function appendText(char: string): void {
  draft.text += char;
  draft.isDirty = draft.text.length > 0;
  syncWords();
}

export function deleteChar(): void {
  draft.text = draft.text.slice(0, -1);
  draft.isDirty = draft.text.length > 0;
  syncWords();
}

export function clearDraft(): void {
  draft.text = '';
  draft.words = [];
  draft.isDirty = false;
  lastWordCount = 0;
}

function syncWords(): void {
  const words = draft.text.trim().split(/\s+/).filter(Boolean);

  if (words.length < lastWordCount) {
    draft.words = draft.words.slice(0, words.length);
    lastWordCount = words.length;
  } else if (words.length > lastWordCount) {
    for (let i = lastWordCount; i < words.length; i++) {
      const pos = placeWord(draft.words);
      draft.words.push({
        word: words[i]!,
        x: pos.x,
        y: pos.y,
        delay: Math.random() * 2000,
        key: wordKey++,
      });
    }
    lastWordCount = words.length;
  }

  // Always sync the current (possibly still-forming) last word
  if (words.length > 0 && draft.words.length > 0) {
    draft.words[words.length - 1]!.word = words[words.length - 1]!;
  }
}
