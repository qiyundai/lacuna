import type { Env } from '../types.js';
import { acquireSnapshot, commitAnalysis, releaseAnalysis } from './storage.js';
import { analyzeSnapshot } from './pipeline.js';

export async function analyzeEntriesAsync(env: Env, userId: string): Promise<void> {
  if (!env.ANTHROPIC_API_KEY) return;
  for (let attempt = 0; attempt < 2; attempt++) {
    const job = await acquireSnapshot(env.DB, userId, 'anthropic');
    if (!job) return;
    try {
      const result = await analyzeSnapshot(job.snapshot, async (prompt, complex, maxTokens) => {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: AbortSignal.timeout(60000),
          headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: complex ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] }),
        });
        if (!response.ok) throw new Error(`AI request failed (${response.status})`);
        const data = await response.json() as { content?: { type: string; text?: string }[]; stop_reason?: string };
        if (data.stop_reason !== 'end_turn') throw new Error('AI response did not complete');
        const text = data.content?.filter(c => c.type === 'text').map(c => c.text ?? '').join('');
        if (!text) throw new Error('Empty AI response');
        return text;
      });
      if (await commitAnalysis(env.DB, userId, job.lease, job.snapshot.version, 'anthropic', result) && result.extracted >= job.snapshot.entries.length) return;
    } finally { await releaseAnalysis(env.DB, userId, job.lease); }
  }
}
