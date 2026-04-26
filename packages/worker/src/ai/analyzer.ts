import type { Env, RangeSummaryRow } from '../types.js';
import {
  getAllEntriesForUser,
  getPatterns,
  upsertPatterns,
  createMemoirSnapshot,
  getMemoryGraph,
  upsertMemoryGraph,
  getRecentEntries,
  getRangeSummaries,
  createRangeSummary,
  getLatestMemoir,
} from '../db.js';
import { MODELS, type ModelWeights } from './models.js';
import {
  buildTier0Prompt,
  buildTier1Prompt,
  buildTier2Prompt,
  buildMemoirPrompt,
  buildConceptExtractionPrompt,
  buildRangeSummaryPrompt,
} from './prompts.js';
import { mergeConceptsIntoGraph } from './graph.js';
import type { ConceptExtraction, MemoryGraph, RangeSummaryResult } from './types.js';

const MEMOIR_INTERVAL = 5;
const RECENT_ENTRIES_WINDOW = 20;
const RANGE_SUMMARY_BATCH_SIZE = 15;
const MAX_EXTRACTION_PER_INVOCATION = 10;

export async function analyzeEntriesAsync(env: Env, userId: string): Promise<void> {
  const entries = await getAllEntriesForUser(env.DB, userId);
  const count = entries.length;

  if (count === 0) return;

  const existingPatterns = await getPatterns(env.DB, userId);
  let modelWeights: ModelWeights = {};
  if (existingPatterns) {
    try {
      modelWeights = JSON.parse(existingPatterns.model_weights) as ModelWeights;
    } catch {
      modelWeights = {};
    }
  }

  // Step 1: Incremental graph extraction for any unprocessed entries
  let graph = await getMemoryGraph(env.DB, userId);
  const lastExtracted = existingPatterns?.graph_extracted_through ?? 0;
  const pendingEntries = entries.slice(lastExtracted);
  const toProcess = pendingEntries.slice(0, MAX_EXTRACTION_PER_INVOCATION);
  const newExtractedThrough = lastExtracted + toProcess.length;

  for (const entry of toProcess) {
    const extraction = await callAnthropic<ConceptExtraction>(
      env.ANTHROPIC_API_KEY,
      'claude-haiku-4-5-20251001',
      buildConceptExtractionPrompt(entry),
      150
    );
    if (extraction) {
      graph = mergeConceptsIntoGraph(graph, extraction);
    } else {
      // Still advance processed_count even if extraction fails
      graph = { ...graph, processed_count: graph.processed_count + 1 };
    }
  }

  if (toProcess.length > 0) {
    await upsertMemoryGraph(env.DB, userId, graph);
  }

  // Step 2: Range summary — compress oldest unsummarized batch if enough entries accumulated
  const rangeSummaries = await getRangeSummaries(env.DB, userId);
  const highestSummarized =
    rangeSummaries.length > 0
      ? rangeSummaries[rangeSummaries.length - 1]!.to_entry_num
      : 0;

  if (count - highestSummarized >= RANGE_SUMMARY_BATCH_SIZE * 2) {
    // At least one full batch ready to summarize
    const batchStart = highestSummarized + 1;
    const batchEnd = batchStart + RANGE_SUMMARY_BATCH_SIZE - 1;
    const batchEntries = entries.slice(batchStart - 1, batchEnd);
    const result = await callAnthropic<RangeSummaryResult>(
      env.ANTHROPIC_API_KEY,
      'claude-haiku-4-5-20251001',
      buildRangeSummaryPrompt(batchEntries, batchStart, batchEnd),
      200
    );
    if (result?.summary) {
      await createRangeSummary(env.DB, userId, batchStart, batchEnd, result.summary);
      rangeSummaries.push({
        id: '',
        user_id: userId,
        from_entry_num: batchStart,
        to_entry_num: batchEnd,
        summary_text: result.summary,
        generated_at: Math.floor(Date.now() / 1000),
      });
    }
  }

  // Step 3: Tier-based pattern analysis
  if (count === 1) {
    const result = await callAnthropic<{ acknowledgment: string }>(
      env.ANTHROPIC_API_KEY,
      'claude-haiku-4-5-20251001',
      buildTier0Prompt(entries[0]!),
      200
    );
    if (result) modelWeights.acknowledgment = result.acknowledgment;
  } else if (count < 10) {
    const result = await callAnthropic<{
      narrative_tone: string;
      emerging_theme: string;
      acknowledgment: string;
    }>(env.ANTHROPIC_API_KEY, 'claude-haiku-4-5-20251001', buildTier1Prompt(entries), 300);
    if (result) {
      modelWeights.narrative_tone = result.narrative_tone;
      modelWeights.emerging_theme = result.emerging_theme;
      modelWeights.acknowledgment = result.acknowledgment;
    }
  } else {
    const recentEntries = await getRecentEntries(env.DB, userId, RECENT_ENTRIES_WINDOW);
    const activeModels = MODELS.filter((m) => m.activationCheck(entries));
    const result = await callAnthropic<{
      weights: Record<string, number>;
      summaries: Record<string, string>;
      overall_tone: string;
    }>(
      env.ANTHROPIC_API_KEY,
      'claude-sonnet-4-6',
      buildTier2Prompt(recentEntries, activeModels, graph, rangeSummaries),
      500
    );
    if (result) {
      modelWeights = {
        ...modelWeights,
        ...result.weights,
        summaries: result.summaries,
        overall_tone: result.overall_tone,
      };
    }
  }

  // Step 4: Persist patterns (with updated extraction cursor)
  const entryCountAtLastMemoir = existingPatterns?.entry_count_at_last_memoir ?? 0;
  const shouldGenerateMemoir =
    count >= 20 && count - entryCountAtLastMemoir >= MEMOIR_INTERVAL;

  await upsertPatterns(
    env.DB,
    userId,
    modelWeights,
    shouldGenerateMemoir ? count : undefined,
    toProcess.length > 0 ? newExtractedThrough : undefined
  );

  // Step 5: Memoir generation
  if (shouldGenerateMemoir) {
    const previousMemoir = await getLatestMemoir(env.DB, userId);
    // Only send entries that are new since the last memoir generation
    const newEntriesSinceMemoir = entries.slice(entryCountAtLastMemoir);
    const recentForMemoir = newEntriesSinceMemoir.slice(-RECENT_ENTRIES_WINDOW);

    const prose = await generateMemoir(
      env.ANTHROPIC_API_KEY,
      recentForMemoir,
      modelWeights,
      graph,
      rangeSummaries,
      previousMemoir?.prose
    );
    if (prose) {
      await createMemoirSnapshot(env.DB, userId, prose);
    }
  }
}

async function generateMemoir(
  apiKey: string,
  newEntries: Parameters<typeof buildMemoirPrompt>[0],
  modelWeights: ModelWeights,
  graph: MemoryGraph,
  rangeSummaries: RangeSummaryRow[],
  previousMemoir?: string
): Promise<string | null> {
  const prompt = buildMemoirPrompt(newEntries, modelWeights, graph, rangeSummaries, previousMemoir);
  return callAnthropicRaw(apiKey, 'claude-sonnet-4-6', prompt, 1000);
}

async function callAnthropic<T>(
  apiKey: string,
  model: string,
  prompt: { system: string; user: string },
  maxTokens: number
): Promise<T | null> {
  const raw = await callAnthropicRaw(apiKey, model, prompt, maxTokens);
  if (!raw) return null;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

async function callAnthropicRaw(
  apiKey: string,
  model: string,
  prompt: { system: string; user: string },
  maxTokens: number
): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    });
    if (!response.ok) {
      console.error('Anthropic API error:', response.status, await response.text());
      return null;
    }
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content[0]?.text ?? null;
  } catch (err) {
    console.error('Anthropic fetch failed:', err);
    return null;
  }
}
