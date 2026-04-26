export interface MemoryNode {
  concept: string;
  type: 'theme' | 'emotion' | 'entity';
  weight: number;
  count: number;
}

export interface MemoryGraph {
  nodes: MemoryNode[];
  processed_count: number;
}

export interface ConceptExtraction {
  themes: string[];
  emotions: string[];
  entities: string[];
}

export interface RangeSummaryResult {
  summary: string;
}
