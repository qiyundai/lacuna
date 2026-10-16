# Memory Graph — Remaining Work

Items here were intentionally deferred from the initial implementation. P0s have been fixed; these are quality, robustness, and future-capability improvements.

---

## Current constraints

Activation scans all retained entries. Range summaries do not replace or delete original entries, so missing access to compressed historical text is not a current defect. If retention changes later, reassess activation with explicit provenance rather than treating generated graph labels as equivalent evidence.

The range-summary threshold is now 35 (15 summarized entries plus a 20-entry recent window). The graph query type now matches its selected fields. Concurrency, deletion consistency, checkpoint recovery and companion work are documented in the root `AUDIT.md`.

Companion lifetime and loading all history remain scalability constraints. Introduce resumable jobs and bounded historical reads before claiming reliable processing for large accounts; benchmark those changes against representative histories.

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

---

## P3 — Future capability

### Embeddings for semantic entry retrieval
Enables "find entries most similar to what I'm writing now" (useful for soul map resonance), better concept clustering, and richer pattern detection.
**Requires:** Cloudflare Vectorize binding, a separately authorized embedding integration, vector similarity queries.
**Defer until:** private loop is stable and user testing shows this is needed.

### Community / cross-user pattern matching
Graph nodes can contain sensitive themes, named people, places, and inferred feelings. Abstraction does not make them anonymous or safe to share. Any cross-user feature needs an explicit privacy design and consent before implementation.
**Explicitly Phase 2+** per spec. No action until then.

