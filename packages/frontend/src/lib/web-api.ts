import { browserVault, WebVault, WebVaultError, announceBrowserLock } from './web-vault.js';
import type { EntryData } from './api.js';

function page<T extends { id: string }>(items: T[], cursor: string | null, kind: string, limit: number) {
  let offset = 0;
  if (cursor) {
    let decoded;
    try { decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cursor), c => c.charCodeAt(0)))); } catch { throw new WebVaultError('BAD_CURSOR', 'Reopen the archive to start a fresh search.'); }
    if (!decoded || decoded.kind !== kind || typeof decoded.id !== 'string' || (offset = items.findIndex(item => item.id === decoded.id) + 1) === 0) throw new WebVaultError('BAD_CURSOR', 'This archive changed. Reopen it to start again.');
  }
  const selected = items.slice(offset, offset + limit);
  const nextCursor = offset + limit < items.length ? btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ kind, id: selected.at(-1)!.id })))) : null;
  return { selected, nextCursor };
}
export async function webRequest(path: string, method = 'GET', value?: unknown, vault: WebVault = browserVault()): Promise<unknown> {
  if (path === '/auth/account' && method === 'DELETE') { await vault.remove(); announceBrowserLock(); return { ok: true }; }
  const data = vault.read(), url = new URL(path, 'https://local.invalid'), body = value as Record<string, unknown>;
  const timestamp = Math.floor(Date.now() / 1000);
  if (url.pathname === '/entries' && method === 'GET') {
    const query = url.searchParams.get('q') ?? '';
    const entries = data.entries.filter(e => e.body.toLowerCase().includes(query.toLowerCase()) && (url.searchParams.get('kept') !== '1' || e.kept_at !== null)).sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
    const limit = Number(url.searchParams.get('limit') ?? 20);
    if (query.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new WebVaultError('BAD_QUERY', 'Use a shorter search and a page size between 1 and 50.');
    const result = page(entries, url.searchParams.get('cursor'), `entries:${query}:${url.searchParams.get('kept') ?? ''}`, limit);
    return { entries: result.selected, nextCursor: result.nextCursor };
  }
  if (path === '/entries' && method === 'POST') {
    if (!body || typeof body.body !== 'string' || !body.body.trim() || body.body.length > 500 || typeof body.entry_id !== 'string' || !/^[a-f0-9]{32}$/.test(body.entry_id) || !Number.isSafeInteger(body.solidified_at) || (body.solidified_at as number) < 0 || (body.solidified_at as number) > timestamp + 300) throw new WebVaultError('BAD_THOUGHT', 'Use up to 500 characters for a thought.');
    const owner = (await vault.status()).owner!;
    return vault.update(journal => {
      const existing = journal.entries.find(e => e.id === body.entry_id);
      if (existing) { if (existing.body !== body.body) throw new WebVaultError('ENTRY_CONFLICT', 'This thought ID already belongs to a different thought.'); return { entry: existing }; }
      const entry: EntryData = { id: body.entry_id as string, user_id: owner, body: body.body as string, created_at: timestamp, solidified_at: body.solidified_at as number, kept_at: null };
      journal.entries.push(entry); return { entry };
    });
  }
  const entry = /^\/entries\/([a-f0-9]{32})(\/keep)?$/.exec(path);
  if (entry && (method === 'DELETE' && !entry[2] || method === 'PATCH' && entry[2])) return vault.update(journal => {
    const index = journal.entries.findIndex(e => e.id === entry[1]);
    if (index < 0) throw new WebVaultError('NOT_FOUND', 'This thought is no longer in the archive.');
    if (method === 'DELETE') { journal.entries.splice(index, 1); journal.memoirs = []; journal.weights = {}; journal.graph = { nodes: [], processed_count: 0 }; return { ok: true }; }
    if (typeof body?.kept !== 'boolean') throw new WebVaultError('BAD_REQUEST', 'Choose whether to keep this thought close.');
    journal.entries[index].kept_at = body.kept ? journal.entries[index].kept_at ?? timestamp : null;
    return { entry: journal.entries[index] };
  });
  if (path === '/patterns' && method === 'GET') return { model_weights: data.weights, last_updated: null };
  if (path === '/memoir' && method === 'GET') return data.memoirs.at(-1) ?? null;
  if (url.pathname === '/memoir/history' && method === 'GET') { const result = page([...data.memoirs].reverse(), url.searchParams.get('cursor'), 'memoirs', 10); return { editions: result.selected, nextCursor: result.nextCursor }; }
  if (path === '/story' && method === 'GET') return { summary: { total: data.entries.length, kept: data.entries.filter(e => e.kept_at !== null).length, first_at: data.entries.reduce<number | null>((a, e) => a === null ? e.created_at : Math.min(a, e.created_at), null), last_at: data.entries.reduce<number | null>((a, e) => a === null ? e.created_at : Math.max(a, e.created_at), null) }, graph: data.graph };
  if (path === '/story/export' && method === 'GET') return { format: 'lacuna.archive.v1', exported_at: new Date().toISOString(), entries: data.entries, memoirs: data.memoirs, patterns: { model_weights: JSON.stringify(data.weights) }, graph: data.graph, summaries: [] };
  if (path === '/ai/status' && method === 'GET') return { provider: 'chatgpt', pending: 0, entryCount: data.entries.length };
  if (path.startsWith('/ai/')) throw new WebVaultError('HOSTED_CHATGPT_PENDING', 'ChatGPT reflections are not connected in this browser yet. Your writing is saved privately.');
  throw new WebVaultError('NOT_FOUND', 'That action is not available in this browser.');
}
export async function webControl(path: string, method: string, value?: unknown): Promise<unknown> {
  const vault = browserVault(), body = value as { passphrase?: string; create?: boolean; envelope?: unknown };
  if (path === 'vault/status') { const status = await vault.status(); return { ...status, aiAllowed: false, automaticAI: false, migrated: true, sync: { enabled: false, version: 0, error: '' } }; }
  if (path === 'vault/unlock' && method === 'POST') { await vault.unlock(body?.passphrase ?? '', body?.create === true); return { ok: true }; }
  if (path === 'vault/lock' && method === 'POST') { vault.lock(); announceBrowserLock(); return { ok: true }; }
  if (path === 'vault/activity' && method === 'POST') { vault.activity(); return { ok: true }; }
  if (path === 'vault/backup' && method === 'GET') return vault.backup();
  if (path === 'vault/restore' && method === 'POST') { if (!body?.envelope) throw new WebVaultError('BACKUP_REQUIRED', 'Choose an encrypted browser backup file to restore.'); await vault.restore(body.envelope, body.passphrase ?? ''); announceBrowserLock(); return { ok: true }; }
  throw new WebVaultError('NOT_AVAILABLE', 'This connection is not available in the browser app yet.');
}
