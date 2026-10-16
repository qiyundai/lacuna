import type { EntryRow, MemoryGraphRow, MemoirSnapshotRow, PatternRow, RangeSummaryRow, UserRow } from './types.js';
import type { MemoryGraph } from './ai/types.js';
import { validGraph } from './ai/validation.js';
export class EntryConflictError extends Error {}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
}

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function upsertUser(db: D1Database, email: string): Promise<UserRow> {
  await db
    .prepare(
      "INSERT INTO users (email, consent_given_at, ai_provider) VALUES (?, unixepoch(), 'chatgpt') ON CONFLICT(email) DO UPDATE SET consent_given_at = coalesce(users.consent_given_at, excluded.consent_given_at)"
    )
    .bind(email)
    .run();
  const user = await getUserByEmail(db, email);
  if (!user) throw new Error('Failed to upsert user');
  return user;
}

export async function createEntry(
  db: D1Database,
  userId: string,
  body: string,
  solidifiedAt: number,
  entryId?: string
): Promise<EntryRow> {
  const id = entryId ?? crypto.randomUUID().replace(/-/g, '');
  await db
    .prepare(
      'INSERT INTO entries (id, user_id, body, solidified_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING'
    )
    .bind(id, userId, body, solidifiedAt)
    .run();
  const entry = await db
    .prepare('SELECT * FROM entries WHERE id = ?')
    .bind(id)
    .first<EntryRow>();
  if (!entry) throw new Error('Failed to create entry');
  if (entry.user_id !== userId || entry.body !== body) throw new EntryConflictError('Entry ID already used');
  return entry;
}

export async function getEntries(
  db: D1Database,
  userId: string,
  cursor: string | null,
  limit: number,
  filter: { query?: string; kept?: boolean } = {}
): Promise<EntryRow[]> {
  const clauses = ['user_id = ?'];
  const args: (string | number)[] = [userId];
  if (filter.query) { clauses.push('instr(lower(body), lower(?)) > 0'); args.push(filter.query); }
  if (filter.kept) clauses.push('kept_at IS NOT NULL');
  if (cursor) {
    const cursorEntry = await db
      .prepare('SELECT created_at FROM entries WHERE id = ? AND user_id = ?')
      .bind(cursor, userId)
      .first<{ created_at: number }>();
    if (!cursorEntry) return [];
    clauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
    args.push(cursorEntry.created_at, cursorEntry.created_at, cursor);
  }
  const result = await db
    .prepare(`SELECT * FROM entries WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .bind(...args, limit)
    .all<EntryRow>();
  return result.results;
}

export async function getAllEntriesForUser(db: D1Database, userId: string): Promise<EntryRow[]> {
  const result = await db
    .prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY rowid ASC')
    .bind(userId)
    .all<EntryRow>();
  return result.results;
}

export async function getPatterns(db: D1Database, userId: string): Promise<PatternRow | null> {
  return db.prepare('SELECT * FROM patterns WHERE user_id = ?').bind(userId).first<PatternRow>();
}

export async function upsertPatterns(
  db: D1Database,
  userId: string,
  modelWeights: object,
  entryCountAtLastMemoir?: number,
  graphExtractedThrough?: number
): Promise<void> {
  await db.prepare(`INSERT INTO patterns (user_id, model_weights, entry_count_at_last_memoir, graph_extracted_through)
    VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
    model_weights = excluded.model_weights,
    entry_count_at_last_memoir = coalesce(?, patterns.entry_count_at_last_memoir),
    graph_extracted_through = coalesce(?, patterns.graph_extracted_through), last_updated = unixepoch()`)
    .bind(userId, JSON.stringify(modelWeights), entryCountAtLastMemoir ?? 0, graphExtractedThrough ?? 0,
      entryCountAtLastMemoir ?? null, graphExtractedThrough ?? null).run();
}

export async function getMemoryGraph(db: D1Database, userId: string): Promise<MemoryGraph> {
  const row = await db
    .prepare('SELECT graph_json FROM memory_graph WHERE user_id = ?')
    .bind(userId)
    .first<Pick<MemoryGraphRow, 'graph_json'>>();
  if (!row) return { nodes: [], processed_count: 0 };
  try {
    const value: unknown = JSON.parse(row.graph_json);
    return validGraph(value) ? value : { nodes: [], processed_count: 0 };
  } catch {
    return { nodes: [], processed_count: 0 };
  }
}

export async function getRangeSummaries(
  db: D1Database,
  userId: string
): Promise<RangeSummaryRow[]> {
  const result = await db
    .prepare(
      'SELECT * FROM range_summaries WHERE user_id = ? ORDER BY from_entry_num ASC'
    )
    .bind(userId)
    .all<RangeSummaryRow>();
  return result.results;
}

export async function getLatestMemoir(
  db: D1Database,
  userId: string
): Promise<MemoirSnapshotRow | null> {
  return db
    .prepare('SELECT * FROM memoir_snapshots WHERE user_id = ? ORDER BY generated_at DESC, rowid DESC LIMIT 1')
    .bind(userId)
    .first<MemoirSnapshotRow>();
}

export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}

export async function deleteEntry(
  db: D1Database,
  userId: string,
  entryId: string
): Promise<boolean> {
  // Derived text can contain deleted content. Remove it atomically with the source.
  const results = await db.batch([
    ...['patterns', 'memory_graph', 'range_summaries', 'memoir_snapshots', 'analysis_jobs'].map(table =>
      db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND EXISTS (SELECT 1 FROM entries WHERE id = ? AND user_id = ?)`)
        .bind(userId, entryId, userId)),
    db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').bind(entryId, userId),
  ]);
  const result = results[results.length - 1]!;
  return (result.meta.changes ?? 0) > 0;
}
