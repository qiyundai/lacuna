import type {
  ChallengeRow,
  CredentialRow,
  EmailOTPRow,
  EntryRow,
  MemoirSnapshotRow,
  PatternRow,
  UserRow,
} from './types.js';

// ── Users ────────────────────────────────────────────────────────────────────

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function getUserByEmail(db: D1Database, email: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
}

export async function setUserEmail(db: D1Database, userId: string, email: string): Promise<void> {
  await db.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, userId).run();
}

export async function setRecoveryCodeHash(db: D1Database, userId: string, hash: string): Promise<void> {
  await db.prepare('UPDATE users SET recovery_code_hash = ? WHERE id = ?').bind(hash, userId).run();
}

export async function setAiConsent(db: D1Database, userId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('UPDATE users SET ai_consent_at = ? WHERE id = ? AND ai_consent_at IS NULL')
    .bind(now, userId).run();
}

export async function getUserByRecoveryHash(db: D1Database, hash: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE recovery_code_hash = ?')
    .bind(hash)
    .first<UserRow>();
}

export async function storeEmailOTP(
  db: D1Database,
  userId: string,
  codeHash: string,
  ttlSeconds = 600
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  // One OTP per user at a time — delete any existing before inserting
  await db.prepare('DELETE FROM email_otps WHERE user_id = ?').bind(userId).run();
  await db
    .prepare('INSERT INTO email_otps (user_id, code_hash, expires_at) VALUES (?, ?, ?)')
    .bind(userId, codeHash, expiresAt)
    .run();
}

export async function consumeEmailOTP(
  db: D1Database,
  userId: string,
  codeHash: string
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      'SELECT id FROM email_otps WHERE user_id = ? AND code_hash = ? AND expires_at > ?'
    )
    .bind(userId, codeHash, now)
    .first<EmailOTPRow>();
  if (!row) return false;
  await db.prepare('DELETE FROM email_otps WHERE id = ?').bind(row.id).run();
  return true;
}

export async function createUser(db: D1Database): Promise<UserRow> {
  const id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare('INSERT INTO users (id) VALUES (?)').bind(id).run();
  const user = await getUserById(db, id);
  if (!user) throw new Error('Failed to create user');
  return user;
}

export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}

// ── Challenges ───────────────────────────────────────────────────────────────

export async function storeChallenge(
  db: D1Database,
  challenge: string,
  type: 'registration' | 'authentication',
  userId: string | null,
  ttlSeconds = 300
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  await db
    .prepare(
      'INSERT OR REPLACE INTO passkey_challenges (challenge, user_id, type, expires_at) VALUES (?, ?, ?, ?)'
    )
    .bind(challenge, userId, type, expiresAt)
    .run();
}

export async function consumeChallenge(
  db: D1Database,
  challenge: string,
  type: 'registration' | 'authentication'
): Promise<ChallengeRow | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      'SELECT * FROM passkey_challenges WHERE challenge = ? AND type = ? AND expires_at > ?'
    )
    .bind(challenge, type, now)
    .first<ChallengeRow>();
  if (!row) return null;
  await db.prepare('DELETE FROM passkey_challenges WHERE challenge = ?').bind(challenge).run();
  return row;
}

export async function consumeChallengeByUser(
  db: D1Database,
  userId: string,
  type: 'registration' | 'authentication'
): Promise<ChallengeRow | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      'SELECT * FROM passkey_challenges WHERE user_id = ? AND type = ? AND expires_at > ? LIMIT 1'
    )
    .bind(userId, type, now)
    .first<ChallengeRow>();
  if (!row) return null;
  await db
    .prepare('DELETE FROM passkey_challenges WHERE challenge = ?')
    .bind(row.challenge)
    .run();
  return row;
}

export async function expireChallenges(db: D1Database): Promise<void> {
  await db
    .prepare('DELETE FROM passkey_challenges WHERE expires_at <= ?')
    .bind(Math.floor(Date.now() / 1000))
    .run();
}

// ── Credentials ──────────────────────────────────────────────────────────────

export async function createCredential(
  db: D1Database,
  credentialId: string,
  userId: string,
  publicKey: string,
  signCount: number
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO passkey_credentials (id, user_id, public_key, sign_count) VALUES (?, ?, ?, ?)'
    )
    .bind(credentialId, userId, publicKey, signCount)
    .run();
}

export async function getCredentialById(
  db: D1Database,
  credentialId: string
): Promise<CredentialRow | null> {
  return db
    .prepare('SELECT * FROM passkey_credentials WHERE id = ?')
    .bind(credentialId)
    .first<CredentialRow>();
}

export async function updateCredentialSignCount(
  db: D1Database,
  credentialId: string,
  signCount: number
): Promise<void> {
  await db
    .prepare('UPDATE passkey_credentials SET sign_count = ? WHERE id = ?')
    .bind(signCount, credentialId)
    .run();
}

// ── Entries ──────────────────────────────────────────────────────────────────

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

// ── Patterns ─────────────────────────────────────────────────────────────────

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

// ── Memoir ───────────────────────────────────────────────────────────────────

export async function getLatestMemoir(
  db: D1Database,
  userId: string
): Promise<MemoirSnapshotRow | null> {
  return db
    .prepare('SELECT * FROM memoir_snapshots WHERE user_id = ? ORDER BY generated_at DESC LIMIT 1')
    .bind(userId)
    .first<MemoirSnapshotRow>();
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
