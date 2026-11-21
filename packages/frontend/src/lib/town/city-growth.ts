import type { CityPage } from '../../../../shared/city-address.js';
export type { CityPage };
export type CityBlock = { x: number; z: number; seed: number; levels: number; green: boolean };

export function hashPage(value: string) {
  let hash = 2166136261;
  for (const c of value) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function cityFromPages(pages: readonly CityPage[]) {
  const ordered = [...pages].sort((a, b) => a.created_at - b.created_at);
  const blocks: CityBlock[] = [];
  const occupied = new Set<string>();
  const frontier = new Map<string, { x: number; z: number }>();
  let latest: CityBlock | undefined;
  function available(x: number, z: number) {
    const key = x + ',' + z;
    if (!occupied.has(key)) frontier.set(key, { x, z });
  }
  available(0, 0);
  for (const [index, page] of ordered.entries()) {
    const seed = hashPage(page.id);
    const mature = index % 4 === 2 ? blocks.filter(block => !block.green && block.levels < 5) : [];
    if (mature.length) {
      latest = mature[seed % mature.length]!;
      latest.levels++;
      continue;
    }
    const candidates = [...frontier.values()].sort((a, b) =>
      shoreDistance(a.x, a.z) - shoreDistance(b.x, b.z) || a.x - b.x || a.z - b.z);
    const site = candidates[seed % Math.min(candidates.length, 5)]!;
    const key = site.x + ',' + site.z;
    occupied.add(key);
    frontier.delete(key);
    latest = { ...site, seed, levels: 1, green: blocks.length % 8 === 5 };
    blocks.push(latest);
    available(site.x - 1, site.z);
    available(site.x + 1, site.z);
    available(site.x, site.z - 1);
    available(site.x, site.z + 1);
  }
  return { blocks, latest };
}

function shoreDistance(x: number, z: number) {
  return Math.hypot(x * .47, z + Math.sin(x * .54) * 1.3);
}
