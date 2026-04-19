import type { Env } from '../types.js';
import {
  getAllEntriesForUser,
  getPatterns,
  upsertPatterns,
  createMemoirSnapshot,
} from '../db.js';
import { MODELS, type ModelWeights } from './models.js';
import {
  buildTier0Prompt,
  buildTier1Prompt,
  buildTier2Prompt,
  buildMemoirPrompt,
} from './prompts.js';

const MEMOIR_INTERVAL = 5; // regenerate every N new entries

export async function analyzeEntriesAsync(env: Env, userId: string): Promise<void> {
  const entries = await getAllEntriesForUser(env.DB, userId);
  const count = entries.length;

  if (count === 0) return;

  let modelWeights: ModelWeights = {};
  const existingPatterns = await getPatterns(env.DB, userId);
  if (existingPatterns) {
    try {
      modelWeights = JSON.parse(existingPatterns.model_weights) as ModelWeights;
    } catch {
      modelWeights = {};
    }
  }

  // Determine tier
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
    const activeModels = MODELS.filter((m) => m.activationCheck(entries));
    const result = await callAnthropic<{
      weights: Record<string, number>;
      summaries: Record<string, string>;
      overall_tone: string;
    }>(
      env.ANTHROPIC_API_KEY,
      'claude-sonnet-4-6',
      buildTier2Prompt(entries, activeModels),
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

  // Determine if memoir should regenerate
  const entryCountAtLastMemoir = existingPatterns?.entry_count_at_last_memoir ?? 0;
  const shouldGenerateMemoir =
    count >= 20 && count - entryCountAtLastMemoir >= MEMOIR_INTERVAL;

  await upsertPatterns(
    env.DB,
    userId,
    modelWeights,
    shouldGenerateMemoir ? count : undefined
  );

  if (shouldGenerateMemoir) {
    const prose = await generateMemoir(env.ANTHROPIC_API_KEY, entries, modelWeights);
    if (prose) {
      await createMemoirSnapshot(env.DB, userId, prose);
    }
  }
}

async function generateMemoir(
  apiKey: string,
  entries: Parameters<typeof buildMemoirPrompt>[0],
  modelWeights: ModelWeights
): Promise<string | null> {
  const prompt = buildMemoirPrompt(entries, modelWeights);
  const response = await callAnthropicRaw(apiKey, 'claude-sonnet-4-6', prompt, 800);
  return response;
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
