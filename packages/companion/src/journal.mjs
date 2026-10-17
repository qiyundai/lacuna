import { PlanError } from './openai.mjs';
import { validGraph, validWeights } from '../../worker/src/ai/validation.ts';
import { validResult } from '../../worker/src/ai/pipeline.ts';

const error = (message) => { throw new PlanError('BAD_REQUEST', message); };
const now = () => Math.floor(Date.now() / 1000);
export function clearDerived(d) { d.weights = {}; d.graph = { nodes: [], processed_count: 0 }; d.summaries = []; d.memoirs = []; d.extracted = 0; d.memoirCount = 0; d.analyzed = -1; }
export function snapshot(d) { return { version: d.version, entries: d.entries, weights: d.weights, graph: d.graph, summaries: d.summaries, memoir: d.memoirs.at(-1)?.prose ?? null, memoirCount: d.memoirCount, extracted: d.extracted }; }
export async function applyAnalysis(vault, source, result) {
  if (!validResult(result)) throw new Error('Invalid reflection result');
  await vault.update(d => {
    if (!d.aiAllowed || d.version !== source.version) throw new PlanError('STALE_ANALYSIS', 'Your journal changed. Refresh reflections again.');
    d.weights = result.weights; d.graph = result.graph; d.extracted = result.extracted; d.memoirCount = result.memoirCount;
    for (const s of result.summaries) d.summaries.push({ id: crypto.randomUUID(), user_id: vault.owner, from_entry_num: s.from, to_entry_num: s.to, summary_text: s.text, generated_at: now() });
    if (result.memoir) d.memoirs.push({ id: crypto.randomUUID(), prose: result.memoir, generated_at: now() });
    d.analyzed = result.extracted === d.entries.length ? d.version : -1;
  });
}
export async function importLegacy(vault, legacy) {
  if (!Array.isArray(legacy.entries) || !Array.isArray(legacy.memoirs) || !Array.isArray(legacy.summaries)) throw new Error('Invalid legacy archive');
  await vault.update(d => {
    const hadEntries = d.entries.length > 0;
    for (const entry of legacy.entries) {
      if (entry.user_id !== vault.owner || typeof entry.body !== 'string' || !/^[a-f0-9]{32}$/.test(entry.id)) throw new Error('Invalid legacy entry');
      const existing = d.entries.find(e => e.id === entry.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) throw new PlanError('MIGRATION_CONFLICT', 'An entry differs between this device and the old cloud archive. Export both copies before resolving it.');
      if (!existing) d.entries.push(entry);
    }
    if (!hadEntries) {
      d.memoirs = legacy.memoirs; d.summaries = legacy.summaries;
      try { const weights = JSON.parse(legacy.patterns?.model_weights ?? '{}'); d.weights = validWeights(weights) ? weights : {}; } catch { d.weights = {}; }
      try { const graph = JSON.parse(legacy.graph?.graph_json ?? '{}'); d.graph = validGraph(graph) ? graph : { nodes: [], processed_count: 0 }; } catch { d.graph = { nodes: [], processed_count: 0 }; }
      d.extracted = d.graph.processed_count;
      d.memoirCount = legacy.patterns?.entry_count_at_last_memoir ?? 0;
    } else clearDerived(d);
    d.version++; d.analyzed = -1;
  });
  await vault.verifySaved();
}
function page(items, url, owner, kind, size) {
  let from = 0;
  const cursor = url.searchParams.get('cursor');
  if (cursor) {
    let parsed;
    try { parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()); } catch { error('Invalid archive cursor.'); }
    if (parsed.owner !== owner || parsed.kind !== kind || typeof parsed.id !== 'string') error('Invalid archive cursor.');
    from = items.findIndex(e => e.id === parsed.id) + 1;
    if (!from) error('This archive changed. Open it again.');
  }
  const selected = items.slice(from, from + size);
  const nextCursor = from + size < items.length ? Buffer.from(JSON.stringify({ owner, kind, id: selected.at(-1).id })).toString('base64url') : null;
  return { selected, nextCursor };
}
export async function journalRequest(vault, path, method, value, url) {
  const d = vault.read();
  if (path === '/entries' && method === 'GET') {
    const query = url.searchParams.get('q') ?? '';
    if (query.length > 200) error('Search must be at most 200 characters.');
    if (url.searchParams.has('kept') && url.searchParams.get('kept') !== '1') error('Invalid kept filter.');
    const list = d.entries.filter(e => (!query || e.body.toLowerCase().includes(query.toLowerCase())) && (url.searchParams.get('kept') !== '1' || e.kept_at !== null)).sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id));
    const limit = Number(url.searchParams.get('limit') ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) error('Invalid page size.');
    const result = page(list, url, vault.owner, `entries:${query}:${url.searchParams.get('kept') ?? ''}`, limit);
    return { entries: result.selected, nextCursor: result.nextCursor };
  }
  if (path === '/entries' && method === 'POST') {
    if (typeof value.body !== 'string' || !value.body.trim() || value.body.length > 500 || !/^[a-f0-9]{32}$/.test(value.entry_id) || !Number.isSafeInteger(value.solidified_at) || value.solidified_at < 0 || value.solidified_at > now() + 300) error('Invalid thought. Use up to 500 characters.');
    return vault.update(data => {
      const existing = data.entries.find(e => e.id === value.entry_id);
      if (existing) { if (existing.body !== value.body) error('This thought ID was already used.'); return { entry: existing }; }
      const entry = { id: value.entry_id, user_id: vault.owner, body: value.body, created_at: now(), solidified_at: value.solidified_at, kept_at: null };
      data.entries.push(entry); data.version++; return { entry };
    });
  }
  const match = /^\/entries\/([a-f0-9]{32})(\/keep)?$/.exec(path);
  if (match && (method === 'DELETE' && !match[2] || method === 'PATCH' && match[2])) {
    if (method === 'PATCH' && typeof value.kept !== 'boolean') error('Invalid kept value.');
    return vault.update(data => {
      const index = data.entries.findIndex(e => e.id === match[1]);
      if (index < 0) throw new PlanError('NOT_FOUND', 'Thought not found.');
      if (method === 'DELETE') { data.entries.splice(index, 1); data.version++; clearDerived(data); return { ok: true }; }
      data.entries[index].kept_at = value.kept ? data.entries[index].kept_at ?? now() : null;
      return { entry: data.entries[index] };
    });
  }
  if (path === '/patterns' && method === 'GET') return { model_weights: d.weights, last_updated: d.memoirs.at(-1)?.generated_at ?? null };
  if (path === '/patterns' && method === 'PATCH') {
    if (!validWeights(value.model_weights)) error('Invalid reflection weights.');
    return vault.update(data => { data.weights = value.model_weights; return { ok: true }; });
  }
  if (path === '/memoir' && method === 'GET') return d.memoirs.at(-1) ?? null;
  if (path === '/memoir/history' && method === 'GET') {
    const result = page([...d.memoirs].reverse(), url, vault.owner, 'memoirs', 10);
    return { editions: result.selected, nextCursor: result.nextCursor };
  }
  if (path === '/story' && method === 'GET') {
    const times = d.entries.map(e => e.created_at);
    return { summary: { total: d.entries.length, kept: d.entries.filter(e => e.kept_at !== null).length, first_at: times.length ? Math.min(...times) : null, last_at: times.length ? Math.max(...times) : null }, graph: d.graph };
  }
  if (path === '/story/export' && method === 'GET') return { format: 'lacuna.archive.v1', exported_at: new Date().toISOString(), entries: d.entries, memoirs: d.memoirs, patterns: { model_weights: JSON.stringify(d.weights) }, graph: d.graph, summaries: d.summaries };
  if (path === '/ai/status' && method === 'GET') return { provider: 'chatgpt', pending: d.aiAllowed && d.analyzed !== d.version && d.entries.length > 0 ? 1 : 0, entryCount: d.entries.length };
  throw new PlanError('NOT_FOUND', 'Not found');
}
