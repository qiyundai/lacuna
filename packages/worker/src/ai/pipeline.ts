import type { EntryRow, RangeSummaryRow } from '../types.js';
import { MODELS, type ModelWeights } from './models.js';
import type { MemoryGraph } from './types.js';
import { mergeConceptsIntoGraph } from './graph.js';
import { buildTier0Prompt, buildTier1Prompt, buildTier2Prompt, buildMemoirPrompt, buildConceptExtractionPrompt, buildRangeSummaryPrompt } from './prompts.js';
import { parseObject, validExtraction, validWeights, isRecord } from './validation.js';

const EXTRACTION_BATCH_SIZE = 10;
const RECENT_ENTRIES_WINDOW = 20;
const SUMMARY_BATCH_SIZE = 15;
const MEMOIR_INTERVAL = 5;

export interface AnalysisSnapshot {
  version: number; entries: EntryRow[]; weights: ModelWeights; graph: MemoryGraph;
  summaries: RangeSummaryRow[]; memoir: string | null; memoirCount: number; extracted: number;
}
export interface AnalysisResult {
  weights: ModelWeights; graph: MemoryGraph; summaries: { from: number; to: number; text: string }[];
  extracted: number; memoir: string | null; memoirCount: number;
}
export type Generate = (prompt: { system: string; user: string }, complex: boolean, maxTokens: number) => Promise<string>;

export async function analyzeSnapshot(snapshot: AnalysisSnapshot, generate: Generate): Promise<AnalysisResult> {
  const { entries } = snapshot;
  const count = entries.length;
  let graph = snapshot.graph;
  let extracted = snapshot.extracted;
  for (const entry of entries.slice(extracted, extracted + EXTRACTION_BATCH_SIZE)) {
    const value = parseObject(await generate(buildConceptExtractionPrompt(entry), false, 500));
    if (!validExtraction(value)) throw new Error('Invalid concept extraction');
    graph = mergeConceptsIntoGraph(graph, value);
    extracted++;
  }
  const summaries = [...snapshot.summaries];
  const newSummaries: AnalysisResult['summaries'] = [];
  const highest = summaries.at(-1)?.to_entry_num ?? 0;
  if (count - highest >= SUMMARY_BATCH_SIZE + RECENT_ENTRIES_WINDOW) {
    const from = highest + 1, to = from + SUMMARY_BATCH_SIZE - 1;
    const value = parseObject(await generate(buildRangeSummaryPrompt(entries.slice(from - 1, to), from, to), false, 800));
    if (typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 8000) throw new Error('Invalid summary');
    newSummaries.push({ from, to, text: value.summary });
    summaries.push({ id: '', user_id: '', from_entry_num: from, to_entry_num: to, summary_text: value.summary, generated_at: 0 });
  }
  let weights: ModelWeights = {};
  if (count > 0) {
    const active = MODELS.filter(m => m.activationCheck(entries));
    const prompt = count === 1 ? buildTier0Prompt(entries[0]!) : count < 10 ? buildTier1Prompt(entries) : buildTier2Prompt(entries.slice(-RECENT_ENTRIES_WINDOW), active, graph, summaries);
    const value = parseObject(await generate(prompt, count >= 10, 1600));
    if (count < 10) {
      if (typeof value.acknowledgment !== 'string' || (count > 1 && (typeof value.narrative_tone !== 'string' || typeof value.emerging_theme !== 'string'))) throw new Error('Invalid reflection');
      weights = { acknowledgment: value.acknowledgment };
      if (count > 1) { weights.narrative_tone = value.narrative_tone as string; weights.emerging_theme = value.emerging_theme as string; }
    } else {
      if (!isRecord(value.weights) || !isRecord(value.summaries) || typeof value.overall_tone !== 'string') throw new Error('Invalid patterns');
      weights = { ...value.weights, summaries: value.summaries as Record<string, string>, overall_tone: value.overall_tone };
      for (const model of MODELS) if (!active.includes(model)) {
        delete weights[model.id as keyof ModelWeights]; delete weights.summaries?.[model.id];
      }
    }
    if (!validWeights(weights)) throw new Error('Invalid pattern values');
  }
  let memoir: string | null = null, memoirCount = snapshot.memoirCount;
  if (count >= RECENT_ENTRIES_WINDOW && count - memoirCount >= MEMOIR_INTERVAL) {
    memoir = (await generate(buildMemoirPrompt(entries.slice(memoirCount).slice(-RECENT_ENTRIES_WINDOW), weights, graph, summaries, snapshot.memoir ?? undefined), true, 2400)).trim();
    if (!memoir || memoir.length > 30000) throw new Error('Invalid memoir');
    memoirCount = count;
  }
  return { weights, graph, summaries: newSummaries, extracted, memoir, memoirCount };
}

export function validResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value) || !validWeights(value.weights) || !isRecord(value.graph) || !Array.isArray(value.graph.nodes) || value.graph.nodes.length > 50) return false;
  if (!value.graph.nodes.every(n => isRecord(n) && typeof n.concept === 'string' && n.concept.length <= 200 && ['theme', 'emotion', 'entity'].includes(n.type as string) && typeof n.weight === 'number' && Number.isFinite(n.weight) && n.weight >= 0 && n.weight <= 1 && Number.isSafeInteger(n.count) && (n.count as number) > 0)) return false;
  if (!Number.isSafeInteger(value.extracted) || (value.extracted as number) < 0 || value.graph.processed_count !== value.extracted || !Number.isSafeInteger(value.memoirCount) || (value.memoirCount as number) < 0) return false;
  return (value.memoir === null || (typeof value.memoir === 'string' && value.memoir.length > 0 && value.memoir.length <= 30000)) && Array.isArray(value.summaries) && value.summaries.length <= 1 && value.summaries.every(s => isRecord(s) && Number.isSafeInteger(s.from) && (s.from as number) >= 1 && Number.isSafeInteger(s.to) && s.to === (s.from as number) + 14 && typeof s.text === 'string' && s.text.length > 0 && s.text.length <= 8000);
}
