import { Hono } from 'hono';
import type { Env, JwtPayload } from '../types.js';
import { authMiddleware } from '../middleware/auth.js';
import { checkRateLimit } from '../ratelimit.js';

export const privacyRoute = new Hono<{ Bindings: Env; Variables: { user: JwtPayload } }>();
privacyRoute.use('*', authMiddleware);
privacyRoute.get('/status', async c => {
  const id = c.get('user').sub;
  const row = await c.env.DB.prepare('SELECT privacy_migration, (SELECT count(*) FROM entries WHERE user_id = users.id) AS entries FROM users WHERE id = ?').bind(id).first<{ privacy_migration: string | null; entries: number }>();
  return c.json({ migrated: !!row?.privacy_migration, entries: row?.entries ?? 0 });
});
privacyRoute.get('/legacy', async c => {
  const id = c.get('user').sub;
  // D1 batch is one transaction: version and every table describe the same copy.
  const rows = await c.env.DB.batch([
    c.env.DB.prepare('SELECT entries_version, privacy_migration FROM users WHERE id = ?').bind(id),
    c.env.DB.prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY rowid').bind(id),
    c.env.DB.prepare('SELECT * FROM memoir_snapshots WHERE user_id = ? ORDER BY generated_at, rowid').bind(id),
    c.env.DB.prepare('SELECT * FROM patterns WHERE user_id = ?').bind(id),
    c.env.DB.prepare('SELECT * FROM memory_graph WHERE user_id = ?').bind(id),
    c.env.DB.prepare('SELECT * FROM range_summaries WHERE user_id = ? ORDER BY from_entry_num').bind(id),
  ]);
  const user = rows[0].results[0] as { entries_version: number; privacy_migration: string | null };
  return c.json({ version: user.entries_version, migrated: !!user.privacy_migration, entries: rows[1].results, memoirs: rows[2].results, patterns: rows[3].results[0] ?? null, graph: rows[4].results[0] ?? null, summaries: rows[5].results });
});
privacyRoute.post('/migrate', async c => {
  const value = await c.req.json<{ version?: unknown }>();
  if (!Number.isSafeInteger(value?.version) || (value.version as number) < 0) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid migration version.' } }, 400);
  const id = c.get('user').sub, marker = crypto.randomUUID();
  const guard = 'EXISTS (SELECT 1 FROM users WHERE id = ? AND privacy_migration = ?)';
  const statements = [c.env.DB.prepare('UPDATE users SET privacy_migration = ? WHERE id = ? AND entries_version = ? AND privacy_migration IS NULL').bind(marker, id, value.version)];
  for (const table of ['patterns', 'memory_graph', 'range_summaries', 'memoir_snapshots', 'analysis_jobs', 'entries']) {
    statements.push(c.env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ? AND ${guard}`).bind(id, id, marker));
  }
  const results = await c.env.DB.batch(statements);
  if (!results[0].meta.changes) return c.json({ error: { code: 'MIGRATION_CONFLICT', message: 'Cloud data changed or was already migrated. Refresh before continuing.' } }, 409);
  return c.json({ ok: true });
});

export function validCloudEnvelope(e: unknown, owner: string): boolean {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
  const v = e as Record<string, unknown>;
  return Object.keys(v).sort().join(',') === 'ciphertext,format,iv,kdf,owner,salt,tag' && v.format === 'lacuna.vault.v1' && v.owner === owner && v.kdf === 'scrypt-131072-8-1' &&
    typeof v.salt === 'string' && /^[a-f0-9]{32}$/.test(v.salt) && typeof v.iv === 'string' && /^[a-f0-9]{24}$/.test(v.iv) && typeof v.tag === 'string' && /^[a-f0-9]{32}$/.test(v.tag) &&
    typeof v.ciphertext === 'string' && v.ciphertext.length > 0 && v.ciphertext.length <= 6 * 1024 * 1024 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.ciphertext);
}
privacyRoute.get('/sync', async c => {
  const rows = await c.env.DB.batch([
    c.env.DB.prepare('SELECT envelope, version, updated_at FROM encrypted_vaults WHERE user_id = ?').bind(c.get('user').sub),
    c.env.DB.prepare('SELECT ciphertext FROM encrypted_vault_chunks WHERE user_id = ? ORDER BY part').bind(c.get('user').sub),
  ]);
  const row = rows[0].results[0] as { envelope: string | null; version: number; updated_at: number } | undefined;
  const envelope = row?.envelope ? { ...JSON.parse(row.envelope), ciphertext: rows[1].results.map(r => (r as { ciphertext: string }).ciphertext).join('') } : null;
  return c.json({ envelope, version: row?.version ?? 0, updated_at: row?.updated_at ?? null });
});
privacyRoute.put('/sync', async c => {
  const id = c.get('user').sub;
  if (!await checkRateLimit(c.env.DB, `sync:${id}`, 120, 3600)) return c.json({ error: { code: 'RATE_LIMITED', message: 'Cloud sync paused. Your local saves are safe.' } }, 429);
  const value = await c.req.json<{ version?: unknown; envelope?: unknown }>();
  if (!Number.isSafeInteger(value?.version) || (value.version as number) < 0 || !validCloudEnvelope(value.envelope, id)) return c.json({ error: { code: 'BAD_REQUEST', message: 'Only supported encrypted vaults are accepted.' } }, 400);
  const envelope = value.envelope as Record<string, string>, marker = crypto.randomUUID();
  const metadata = JSON.stringify({ ...envelope, ciphertext: '' });
  const first = value.version === 0
    ? c.env.DB.prepare('INSERT INTO encrypted_vaults (user_id, envelope, version, write_id) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING RETURNING version').bind(id, metadata, marker)
    : c.env.DB.prepare('UPDATE encrypted_vaults SET envelope = ?, version = version + 1, write_id = ?, updated_at = unixepoch() WHERE user_id = ? AND version = ? RETURNING version').bind(metadata, marker, id, value.version);
  const guard = 'EXISTS (SELECT 1 FROM encrypted_vaults WHERE user_id = ? AND write_id = ?)';
  const statements = [first, c.env.DB.prepare(`DELETE FROM encrypted_vault_chunks WHERE user_id = ? AND ${guard}`).bind(id, id, marker)];
  for (let from = 0, part = 0; from < envelope.ciphertext.length; from += 1000000, part++) statements.push(c.env.DB.prepare(`INSERT INTO encrypted_vault_chunks (user_id, part, ciphertext) SELECT ?, ?, ? WHERE ${guard}`).bind(id, part, envelope.ciphertext.slice(from, from + 1000000), id, marker));
  const results = await c.env.DB.batch(statements);
  if (!results[0].meta.changes) return c.json({ error: { code: 'SYNC_CONFLICT', message: 'A different cloud copy exists. Restore it or delete it explicitly before uploading.' } }, 409);
  return c.json({ version: (value.version as number) + 1 });
});
privacyRoute.delete('/sync', async c => {
  // Retain a counter tombstone so an older device cannot silently resurrect a copy.
  const id = c.get('user').sub;
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO encrypted_vaults (user_id, envelope, version, write_id) VALUES (?, NULL, 1, ?)
      ON CONFLICT(user_id) DO UPDATE SET envelope = NULL, version = version + 1, write_id = excluded.write_id, updated_at = unixepoch()`).bind(id, crypto.randomUUID()),
    c.env.DB.prepare('DELETE FROM encrypted_vault_chunks WHERE user_id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});
