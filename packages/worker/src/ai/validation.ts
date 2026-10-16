import type { ModelWeights } from './models.js';
import type { ConceptExtraction, MemoryGraph } from './types.js';
export const weightKeys = ['story_thread', 'voices', 'blind_spots', 'unsaid', 'story_loop', 'where_you_are'] as const;
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validGraph(value: unknown): value is MemoryGraph {
  return isRecord(value) && Number.isSafeInteger(value.processed_count) && (value.processed_count as number) >= 0 && Array.isArray(value.nodes) && value.nodes.length <= 50 &&
    value.nodes.every(n => isRecord(n) && typeof n.concept === 'string' && n.concept.length <= 200 && ['theme', 'emotion', 'entity'].includes(n.type as string) && typeof n.weight === 'number' && Number.isFinite(n.weight) && n.weight >= 0 && n.weight <= 1 && Number.isSafeInteger(n.count) && (n.count as number) > 0);
}
export function validWeights(value: unknown): value is ModelWeights {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, val]) => {
    if ((weightKeys as readonly string[]).includes(key)) return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 1;
    if (key === 'summaries') return isRecord(val) && Object.entries(val).every(([k, v]) => (weightKeys as readonly string[]).includes(k) && typeof v === 'string' && v.length <= 2000);
    return ['acknowledgment', 'narrative_tone', 'emerging_theme', 'overall_tone'].includes(key) && typeof val === 'string' && val.length <= 2000;
  });
}
export function validExtraction(value: unknown): value is ConceptExtraction {
  return isRecord(value) && ['themes', 'emotions', 'entities'].every(key => Array.isArray(value[key]) && value[key].length <= 10 && value[key].every(v => typeof v === 'string' && v.length <= 200));
}
export function parseObject(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!isRecord(value)) throw new Error('Invalid analysis output');
  return value;
}
