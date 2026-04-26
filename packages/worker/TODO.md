# Memory Graph — Remaining Work

Items here were intentionally deferred from the initial implementation. P0s have been fixed; these are quality, robustness, and future-capability improvements.

---

## P1 — Quality regressions worth fixing soon

### `blind_spots` false positives on historical themes
**Status:** Partially fixed (activation now runs on all entries).
**Remaining issue:** The activation check still uses regex on entry bodies, not graph nodes. A user whose older entries contained relationship/body/future keywords but were compressed into range summaries will still activate `blind_spots` correctly because we scan all entries — but once the entry body is only reachable through a range summary, the regex won't see it. This becomes a problem when entry counts are very high and some entries are *only* represented as summaries (no verbatim copy retained).
**Fix:** Augment the `blind_spots` activation text with graph node labels:
```typescript
const graphText = graph.nodes.map((n) => n.concept).join(' ');
const text = [...entries.map((e) => e.body), graphText].join(' ').toLowerCase();
```
Or change `ModelDefinition.activationCheck` to accept an optional `graphConcepts: string[]` second param.

### Range summary threshold slightly misaligned
**Current:** `count - highestSummarized >= RANGE_SUMMARY_BATCH_SIZE * 2` = 30
**Ideal:** `RANGE_SUMMARY_BATCH_SIZE + RECENT_ENTRIES_WINDOW` = 35
This means entries 16–30 could appear in both a range summary AND the recent entries window (slight prompt redundancy). Not a correctness bug, just wasted tokens.
**Fix:** Change constant to `RANGE_SUMMARY_BATCH_SIZE + RECENT_ENTRIES_WINDOW`.

---

## P2 — Structural improvements

### No temporal structure in graph nodes
Graph nodes track `weight` and `count` but not *when* a concept appeared. The memoir prompt can't say "work anxiety was dominant early but has faded" — it only knows the current cumulative weight.
**Fix:** Add `first_seen` and `last_seen` (entry ordinals) to `MemoryNode`. Pass these to `buildGraphContextString` so the prompt can convey arc ("appears in early entries", "recent", "consistent throughout").

### Vocabulary fragmentation
"burned out", "exhausted", "drained" become three separate graph nodes. The graph can't tell they're the same signal, so the weight for that theme is diluted across synonyms.
**Fix:** Requires semantic similarity — either:
- Add Cloudflare Vectorize, embed each extracted concept, cluster by cosine similarity before merging into graph nodes
- Simpler: in the extraction prompt, ask the model to normalize synonyms to a canonical form ("exhaustion" not "burned out")
  
The prompt normalization approach is cheaper and fits the current stack.

### `getMemoryGraph` type inaccuracy
`db.ts` selects only `graph_json` from `memory_graph` but types the result as `MemoryGraphRow` (which also has `user_id` and `last_updated`). Works at runtime since we only access `row.graph_json`, but is misleading.
**Fix:** Change select to `SELECT * FROM memory_graph` or type the result as `Pick<MemoryGraphRow, 'graph_json'>`.

---

## P3 — Future capability

### Embeddings for semantic entry retrieval
Enables "find entries most similar to what I'm writing now" (useful for soul map resonance), better concept clustering, and richer pattern detection.
**Requires:** Cloudflare Vectorize binding, embedding call per entry (Anthropic or Workers AI), vector similarity queries.
**Defer until:** private loop is stable and user testing shows this is needed.

### Community / cross-user pattern matching
Graph nodes are already abstracted from raw text, which makes them safe to compare across users without exposing entry content. Could enable "others who return to similar themes" or aggregate pattern insights.
**Explicitly Phase 2+** per spec. No action until then.

### Privacy policy update
The memory graph introduces two new categories of stored personal data that aren't covered by a current privacy policy:
1. Concept nodes (psychological labels derived from entries)
2. Range summaries (AI-generated prose about emotional arcs)

Each entry now also triggers one additional Anthropic API call (concept extraction) beyond what existed before. The privacy policy should disclose:
- That entries are processed by Anthropic to generate a concept graph (in addition to pattern analysis and memoir)
- What data is retained (raw entries, concept graph, range summaries, memoir snapshots)
- Right to erasure (already handled by CASCADE deletes)

**Do before launch.**
