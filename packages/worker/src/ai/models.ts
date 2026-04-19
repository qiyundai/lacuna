import type { EntryRow } from '../types.js';

export interface ModelDefinition {
  id: string;
  plainLabel: string;
  activationCheck: (entries: EntryRow[]) => boolean;
}

export const MODELS: ModelDefinition[] = [
  {
    id: 'story_thread',
    plainLabel: 'Story / Through-line',
    activationCheck: () => true, // Always active
  },
  {
    id: 'voices',
    plainLabel: 'Voices',
    activationCheck: (entries) => {
      const text = entries.map((e) => e.body).join(' ').toLowerCase();
      return (
        /part of me/.test(text) ||
        /i don'?t know why i/.test(text) ||
        /i should but/.test(text) ||
        /part of me/.test(text)
      );
    },
  },
  {
    id: 'blind_spots',
    plainLabel: 'Blind Spots',
    activationCheck: (entries) => {
      if (entries.length < 10) return false;
      const text = entries.map((e) => e.body).join(' ').toLowerCase();
      // Activates when certain theme clusters are conspicuously absent
      const hasRelationships = /friend|partner|family|love|together|someone/.test(text);
      const hasBody = /body|sleep|tired|energy|health|eat|breath/.test(text);
      const hasFuture = /future|plan|goal|someday|want to|will be/.test(text);
      return !hasRelationships || !hasBody || !hasFuture;
    },
  },
  {
    id: 'unsaid',
    plainLabel: "What's Unsaid",
    activationCheck: (entries) => {
      const text = entries.map((e) => e.body).join(' ').toLowerCase();
      const negationCount = (text.match(/\bi never\b|\bi don'?t\b|\bi'?m not that\b/g) ?? []).length;
      return negationCount >= 3;
    },
  },
  {
    id: 'story_loop',
    plainLabel: 'The Story You Keep Telling',
    activationCheck: (entries) => {
      if (entries.length < 3) return false;
      const descriptors: string[] = [];
      for (const entry of entries) {
        const matches = entry.body.toLowerCase().match(/i'?m always|i always end up|i tend to/g);
        if (matches) descriptors.push(...matches);
      }
      return descriptors.length >= 3;
    },
  },
  {
    id: 'where_you_are',
    plainLabel: 'Where You Are',
    activationCheck: (entries) => {
      const text = entries.map((e) => e.body).join(' ').toLowerCase();
      return /\b(family|legacy|career|belonging|mortality|purpose|identity|growing up|getting older)\b/.test(
        text
      );
    },
  },
];

export interface ModelWeights {
  story_thread?: number;
  voices?: number;
  blind_spots?: number;
  unsaid?: number;
  story_loop?: number;
  where_you_are?: number;
  acknowledgment?: string;
  narrative_tone?: string;
  emerging_theme?: string;
  overall_tone?: string;
  summaries?: Record<string, string>;
}
