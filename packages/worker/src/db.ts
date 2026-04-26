import type { EntryRow, MemoirSnapshotRow, PatternRow, UserRow } from './types.js';

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
}

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function getUserByMagicToken(db: D1Database, token: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE magic_token = ?')
    .bind(token)
    .first<UserRow>();
}

export async function upsertUser(db: D1Database, email: string): Promise<UserRow> {
  await db
    .prepare('INSERT INTO users (email) VALUES (?) ON CONFLICT(email) DO NOTHING')
    .bind(email)
    .run();
  const user = await getUserByEmail(db, email);
  if (!user) throw new Error('Failed to upsert user');
  return user;
}

export async function setMagicToken(
  db: D1Database,
  userId: string,
  token: string,
  expiresAt: number
): Promise<void> {
  await db
    .prepare('UPDATE users SET magic_token = ?, magic_token_expires_at = ? WHERE id = ?')
    .bind(token, expiresAt, userId)
    .run();
}

export async function clearMagicToken(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare('UPDATE users SET magic_token = NULL, magic_token_expires_at = NULL WHERE id = ?')
    .bind(userId)
    .run();
}

export async function createEntry(
  db: D1Database,
  userId: string,
  body: string,
  solidifiedAt: number
): Promise<EntryRow> {
  const id = crypto.randomUUID().replace(/-/g, '');
  await db
    .prepare(
      'INSERT INTO entries (id, user_id, body, solidified_at) VALUES (?, ?, ?, ?)'
    )
    .bind(id, userId, body, solidifiedAt)
    .run();
  const entry = await db
    .prepare('SELECT * FROM entries WHERE id = ?')
    .bind(id)
    .first<EntryRow>();
  if (!entry) throw new Error('Failed to create entry');
  return entry;
}

export async function getEntries(
  db: D1Database,
  userId: string,
  cursor: string | null,
  limit: number
): Promise<EntryRow[]> {
  if (cursor) {
    const cursorEntry = await db
      .prepare('SELECT created_at FROM entries WHERE id = ? AND user_id = ?')
      .bind(cursor, userId)
      .first<{ created_at: number }>();
    if (!cursorEntry) return [];
    // Compound cursor: (created_at DESC, id DESC) avoids skipping rows with identical timestamps
    const result = await db
      .prepare(
        `SELECT * FROM entries
         WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
      )
      .bind(userId, cursorEntry.created_at, cursorEntry.created_at, cursor, limit)
      .all<EntryRow>();
    return result.results;
  }
  const result = await db
    .prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .bind(userId, limit)
    .all<EntryRow>();
  return result.results;
}

export async function getAllEntriesForUser(db: D1Database, userId: string): Promise<EntryRow[]> {
  const result = await db
    .prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY created_at ASC')
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
  entryCountAtLastMemoir?: number
): Promise<void> {
  const existing = await getPatterns(db, userId);
  const weightsJson = JSON.stringify(modelWeights);
  const now = Math.floor(Date.now() / 1000);
  if (existing) {
    if (entryCountAtLastMemoir !== undefined) {
      await db
        .prepare(
          'UPDATE patterns SET model_weights = ?, entry_count_at_last_memoir = ?, last_updated = ? WHERE user_id = ?'
        )
        .bind(weightsJson, entryCountAtLastMemoir, now, userId)
        .run();
    } else {
      await db
        .prepare('UPDATE patterns SET model_weights = ?, last_updated = ? WHERE user_id = ?')
        .bind(weightsJson, now, userId)
        .run();
    }
  } else {
    const id = crypto.randomUUID().replace(/-/g, '');
    await db
      .prepare(
        'INSERT INTO patterns (id, user_id, model_weights, entry_count_at_last_memoir, last_updated) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(id, userId, weightsJson, entryCountAtLastMemoir ?? 0, now)
      .run();
  }
}

export async function getLatestMemoir(
  db: D1Database,
  userId: string
): Promise<MemoirSnapshotRow | null> {
  return db
    .prepare('SELECT * FROM memoir_snapshots WHERE user_id = ? ORDER BY generated_at DESC LIMIT 1')
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
  const result = await db
    .prepare('DELETE FROM entries WHERE id = ? AND user_id = ?')
    .bind(entryId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function createMemoirSnapshot(
  db: D1Database,
  userId: string,
  prose: string
): Promise<void> {
  const id = crypto.randomUUID().replace(/-/g, '');
  await db
    .prepare('INSERT INTO memoir_snapshots (id, user_id, prose) VALUES (?, ?, ?)')
    .bind(id, userId, prose)
    .run();
}
