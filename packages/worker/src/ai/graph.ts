import type { ConceptExtraction, MemoryGraph, MemoryNode } from './types.js';

const MAX_NODES = 50;
const WEIGHT_DECAY = 0.85;
const WEIGHT_NEW = 0.15;

export function emptyGraph(): MemoryGraph {
  return { nodes: [], processed_count: 0 };
}

export function mergeConceptsIntoGraph(
  graph: MemoryGraph,
  extraction: ConceptExtraction
): MemoryGraph {
  const nodes = [...graph.nodes];

  const allConcepts: Array<{ concept: string; type: MemoryNode['type'] }> = [
    ...extraction.themes.map((c) => ({ concept: c.toLowerCase().trim(), type: 'theme' as const })),
    ...extraction.emotions.map((c) => ({ concept: c.toLowerCase().trim(), type: 'emotion' as const })),
    ...extraction.entities.map((c) => ({ concept: c.toLowerCase().trim(), type: 'entity' as const })),
  ].filter((c) => c.concept.length > 0);

  for (const { concept, type } of allConcepts) {
    const existing = nodes.find((n) => n.concept === concept);
    if (existing) {
      existing.weight = WEIGHT_DECAY * existing.weight + WEIGHT_NEW;
      existing.count += 1;
    } else {
      nodes.push({ concept, type, weight: WEIGHT_NEW, count: 1 });
    }
  }

  // Sort by weight descending, trim to cap
  nodes.sort((a, b) => b.weight - a.weight);
  if (nodes.length > MAX_NODES) nodes.splice(MAX_NODES);

  return { nodes, processed_count: graph.processed_count + 1 };
}

export function buildGraphContextString(graph: MemoryGraph): string {
  const MIN_WEIGHT = 0.15;
  const TOP_N = 20;

  const topNodes = graph.nodes
    .filter((n) => n.weight >= MIN_WEIGHT)
    .slice(0, TOP_N);

  if (topNodes.length === 0) return '';

  const lines = topNodes.map((n) => {
    const strength = n.count === 1 ? 'once' : `${n.count}×`;
    return `- ${n.concept} [${n.type}, ${strength}]`;
  });

  return lines.join('\n');
}
