import { getAllEntriesForUser, getLatestMemoir, getMemoryGraph, getPatterns, getRangeSummaries, getUserById } from '../db.js';
import type { AnalysisResult, AnalysisSnapshot } from './pipeline.js';
import { validWeights } from './validation.js';

export async function acquireSnapshot(db: D1Database, userId: string, provider: string): Promise<{ lease: string; snapshot: AnalysisSnapshot } | null> {
  const lease = crypto.randomUUID();
  const row = await db.prepare(`INSERT INTO analysis_jobs (user_id, owner, expires_at)
    SELECT id, ?, unixepoch() + 900 FROM users WHERE id = ? AND ai_provider = ?
    ON CONFLICT(user_id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
    WHERE analysis_jobs.expires_at <= unixepoch() RETURNING owner`).bind(lease, userId, provider).first();
  if (!row) return null;
  try {
    const user = await getUserById(db, userId);
    if (!user) throw new Error('Account no longer exists');
    const entries = await getAllEntriesForUser(db, userId);
    const patterns = await getPatterns(db, userId);
    const graph = await getMemoryGraph(db, userId);
    const summaries = await getRangeSummaries(db, userId);
    const memoir = await getLatestMemoir(db, userId);
    let weights: unknown = {};
    try { weights = JSON.parse(patterns?.model_weights ?? '{}'); } catch { /* rebuild */ }
    return { lease, snapshot: { version: user.entries_version, entries, weights: validWeights(weights) ? weights : {}, graph, summaries,
      memoir: memoir?.prose ?? null, memoirCount: patterns?.entry_count_at_last_memoir ?? 0, extracted: patterns?.graph_extracted_through ?? 0 } };
  } catch (err) {
    await releaseAnalysis(db, userId, lease);
    throw err;
  }
}
export async function releaseAnalysis(db: D1Database, userId: string, lease: string): Promise<void> {
  await db.prepare('DELETE FROM analysis_jobs WHERE user_id = ? AND owner = ?').bind(userId, lease).run();
}
export async function commitAnalysis(db: D1Database, userId: string, lease: string, version: number, provider: string, result: AnalysisResult): Promise<boolean> {
  // All writes share a transaction and guard against new/deleted entries and provider changes.
  const guard = `EXISTS (SELECT 1 FROM users u JOIN analysis_jobs j ON j.user_id = u.id
    WHERE u.id = ? AND u.entries_version = ? AND u.ai_provider = ? AND j.owner = ? AND j.expires_at > unixepoch())`;
  const args = [userId, version, provider, lease];
  const statements = [
    db.prepare(`INSERT INTO patterns (user_id, model_weights, graph_extracted_through, entry_count_at_last_memoir)
      SELECT ?, ?, ?, ? WHERE ${guard} ON CONFLICT(user_id) DO UPDATE SET
      model_weights = excluded.model_weights, graph_extracted_through = excluded.graph_extracted_through,
      entry_count_at_last_memoir = excluded.entry_count_at_last_memoir, last_updated = unixepoch()`)
      .bind(userId, JSON.stringify(result.weights), result.extracted, result.memoirCount, ...args),
    db.prepare(`INSERT INTO memory_graph (user_id, graph_json) SELECT ?, ? WHERE ${guard}
      ON CONFLICT(user_id) DO UPDATE SET graph_json = excluded.graph_json, last_updated = unixepoch()`)
      .bind(userId, JSON.stringify(result.graph), ...args),
  ];
  for (const s of result.summaries) statements.push(db.prepare(`INSERT INTO range_summaries (user_id, from_entry_num, to_entry_num, summary_text) SELECT ?, ?, ?, ? WHERE ${guard}`).bind(userId, s.from, s.to, s.text, ...args));
  if (result.memoir) statements.push(db.prepare(`INSERT INTO memoir_snapshots (user_id, prose) SELECT ?, ? WHERE ${guard}`).bind(userId, result.memoir, ...args));
  statements.push(db.prepare(`UPDATE users SET analyzed_version = CASE WHEN (SELECT count(*) FROM entries WHERE user_id = users.id) = ? THEN ? ELSE -1 END WHERE id = ? AND ${guard}`).bind(result.extracted, version, userId, ...args));
  const results = await db.batch(statements);
  return (results[0]?.meta.changes ?? 0) > 0;
}
