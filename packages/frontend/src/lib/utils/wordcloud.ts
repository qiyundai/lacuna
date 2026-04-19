import type { WordPosition } from '../stores/draft.svelte.js';

const COLS = 5;
const ROWS = 5;
const JITTER = 8; // percent

interface Cell { col: number; row: number }

export function placeWord(existing: WordPosition[]): { x: number; y: number } {
  // Build a grid and find the least-occupied cell
  const occupancy = new Map<string, number>();
  for (const wp of existing) {
    const col = Math.floor((wp.x / 100) * COLS);
    const row = Math.floor((wp.y / 100) * ROWS);
    const key = `${col},${row}`;
    occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
  }

  let bestCell: Cell = { col: 0, row: 0 };
  let minOccupancy = Infinity;

  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const count = occupancy.get(`${col},${row}`) ?? 0;
      if (count < minOccupancy) {
        minOccupancy = count;
        bestCell = { col, row };
      }
    }
  }

  // Center of chosen cell + random jitter
  const cellW = 100 / COLS;
  const cellH = 100 / ROWS;
  const baseX = bestCell.col * cellW + cellW / 2;
  const baseY = bestCell.row * cellH + cellH / 2;

  const jitterX = (Math.random() - 0.5) * JITTER * 2;
  const jitterY = (Math.random() - 0.5) * JITTER * 2;

  return {
    x: Math.max(5, Math.min(90, baseX + jitterX)),
    y: Math.max(5, Math.min(90, baseY + jitterY)),
  };
}
