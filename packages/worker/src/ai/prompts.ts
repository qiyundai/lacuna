import type { EntryRow } from '../types.js';
import type { ModelDefinition, ModelWeights } from './models.js';

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
  entries: EntryRow[],
  activeModels: ModelDefinition[]
): { system: string; user: string } {
  const frameworkList = activeModels
    .map((m) => `- ${m.id} (${m.plainLabel})`)
    .join('\n');

  return {
    system:
      'You are a psychological pattern analyst working across multiple frameworks. For each active framework, analyze the entries and output a weight (0.0–1.0) representing how strongly this framework illuminates this person\'s patterns. Weight 0.0 = not present. Weight 1.0 = strongly dominant.',
    user: `Active frameworks:\n${frameworkList}\n\nFramework reference:\n- story_thread: Through-line and narrative arc\n- voices: Internal fragmentation, conflicting self-parts\n- blind_spots: Consistent avoidances and unseen patterns\n- unsaid: Persistent absences, suppressed themes\n- story_loop: Dominant self-narrative, alternative threads\n- where_you_are: Life-stage themes — belonging, legacy, purpose\n\nEntries:\n${formatEntries(entries)}\n\nOutput strict JSON only:\n{\n  "weights": { "story_thread": 0.8, ... },\n  "summaries": { "story_thread": "...", ... },\n  "overall_tone": "..."\n}`,
  };
}

export function buildMemoirPrompt(
  entries: EntryRow[],
  modelWeights: ModelWeights
): { system: string; user: string } {
  return {
    system:
      "You write reflective, literary prose about human lives. You do not summarize. You illuminate. Your prose sounds like a thoughtful friend who has been listening for years — not a therapist report, not a journal summary.",
    user: `Write a Living Memoir — a 3-5 paragraph narrative that captures:\n- The shape of their story so far\n- What they return to\n- What seems to be shifting\n- The texture of their inner world\n\nDo not invent details not present in entries. Use their words where they are beautiful.\nWrite in second person ("You have been...") — intimate but not presumptuous.\nTone: warm, literary, honest. Never clinical.\n\nEntries (chronological):\n${formatEntries(entries)}\n\nCurrent pattern context: ${JSON.stringify(modelWeights)}\n\nWrite only the prose. No headings, no labels.`,
  };
}
