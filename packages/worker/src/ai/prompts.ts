import type { EntryRow } from '../types.js';
import type { ModelDefinition, ModelWeights } from './models.js';
import type { MemoryGraph } from './types.js';
import { buildGraphContextString } from './graph.js';
import type { RangeSummaryRow } from '../types.js';

function formatEntries(entries: EntryRow[]): string {
  return entries
    .map((e, i) => `${i + 1}. ${e.body}`)
    .join('\n');
}

export function buildTier0Prompt(entry: EntryRow): { system: string; user: string } {
  return {
    system:
      'You are a quiet, reflective presence. Your role is to witness, not diagnose.',
    user: `Someone has written their first reflection: "${entry.body}"\n\nRespond in 1-2 sentences. Acknowledge what they brought. Do not analyze. Do not label. Use plain language. The tone is warm, not clinical.\n\nRespond with JSON: { "acknowledgment": "..." }`,
  };
}

export function buildTier1Prompt(entries: EntryRow[]): { system: string; user: string } {
  return {
    system:
      "You track narrative patterns in human writing. You use the lens of story — not therapy, not diagnosis. McAdams' Narrative Identity framework: every person has a life story made of narrative tones, themes, and through-lines.",
    user: `Entries so far:\n${formatEntries(entries)}\n\nIdentify 1-2 emerging threads only. Do not force patterns that are not there.\n\nOutput JSON: { "narrative_tone": "...", "emerging_theme": "...", "acknowledgment": "..." }\nPlain language only. Max 20 words per field.`,
  };
}

export function buildTier2Prompt(
  recentEntries: EntryRow[],
  activeModels: ModelDefinition[],
  graph: MemoryGraph,
  rangeSummaries: RangeSummaryRow[]
): { system: string; user: string } {
  const frameworkList = activeModels
    .map((m) => `- ${m.id} (${m.plainLabel})`)
    .join('\n');

  const graphSection = buildGraphContextString(graph);
  const summarySection = rangeSummaries
    .map((s) => `Entries ${s.from_entry_num}–${s.to_entry_num}: ${s.summary_text}`)
    .join('\n');

  const contextParts: string[] = [];
  if (summarySection) {
    contextParts.push(`Historical context (compressed):\n${summarySection}`);
  }
  if (graphSection) {
    contextParts.push(`Recurring concepts:\n${graphSection}`);
  }
  contextParts.push(`Recent entries (verbatim):\n${formatEntries(recentEntries)}`);

  return {
    system:
      'You are a psychological pattern analyst working across multiple frameworks. For each active framework, analyze the entries and output a weight (0.0–1.0) representing how strongly this framework illuminates this person\'s patterns. Weight 0.0 = not present. Weight 1.0 = strongly dominant.',
    user: `Active frameworks:\n${frameworkList}\n\nFramework reference:\n- story_thread: Through-line and narrative arc\n- voices: Internal fragmentation, conflicting self-parts\n- blind_spots: Consistent avoidances and unseen patterns\n- unsaid: Persistent absences, suppressed themes\n- story_loop: Dominant self-narrative, alternative threads\n- where_you_are: Life-stage themes — belonging, legacy, purpose\n\n${contextParts.join('\n\n')}\n\nOutput strict JSON only:\n{\n  "weights": { "story_thread": 0.8, ... },\n  "summaries": { "story_thread": "...", ... },\n  "overall_tone": "..."\n}`,
  };
}

export function buildMemoirPrompt(
  newEntries: EntryRow[],
  modelWeights: ModelWeights,
  graph: MemoryGraph,
  rangeSummaries: RangeSummaryRow[],
  previousMemoir?: string
): { system: string; user: string } {
  const graphSection = buildGraphContextString(graph);
  const summarySection = rangeSummaries
    .map((s) => `Entries ${s.from_entry_num}–${s.to_entry_num}: ${s.summary_text}`)
    .join('\n');

  const contextParts: string[] = [];
  if (previousMemoir) {
    contextParts.push(`Story so far (previous memoir):\n${previousMemoir}`);
  }
  if (summarySection) {
    contextParts.push(`Earlier entries (compressed):\n${summarySection}`);
  }
  if (graphSection) {
    contextParts.push(`Recurring concepts:\n${graphSection}`);
  }
  contextParts.push(
    newEntries.length > 0
      ? `Recent entries (verbatim):\n${formatEntries(newEntries)}`
      : 'No new entries since last memoir.'
  );

  return {
    system:
      "You write reflective, literary prose about human lives. You do not summarize. You illuminate. Your prose sounds like a thoughtful friend who has been listening for years — not a therapist report, not a journal summary.",
    user: `Write a Living Memoir — a 3-5 paragraph narrative that captures:\n- The shape of their story so far\n- What they return to\n- What seems to be shifting\n- The texture of their inner world\n\nDo not invent details not present in entries. Use their words where they are beautiful.\nWrite in second person ("You have been...") — intimate but not presumptuous.\nTone: warm, literary, honest. Never clinical.\n\n${contextParts.join('\n\n')}\n\nCurrent pattern context: ${JSON.stringify(modelWeights)}\n\nWrite only the prose. No headings, no labels.`,
  };
}

export function buildConceptExtractionPrompt(entry: EntryRow): { system: string; user: string } {
  return {
    system: 'You extract concepts from journal reflections. Be concise and concrete.',
    user: `Reflection: "${entry.body}"\n\nExtract:\n- Up to 3 themes (abstract concepts this is about)\n- Up to 2 emotions (feelings present)\n- Up to 2 entities (named people or places, if any — skip if none)\n\nOutput strict JSON only:\n{ "themes": ["..."], "emotions": ["..."], "entities": ["..."] }`,
  };
}

export function buildRangeSummaryPrompt(
  entries: EntryRow[],
  fromNum: number,
  toNum: number
): { system: string; user: string } {
  return {
    system:
      'You compress journal entries into dense narrative summaries for long-term memory. Capture emotional arc and recurring concerns in 2-3 sentences.',
    user: `Entries ${fromNum}–${toNum}:\n${formatEntries(entries)}\n\nWrite a 2-3 sentence summary capturing the emotional arc and key concerns of this period.\n\nOutput strict JSON only:\n{ "summary": "..." }`,
  };
}
