export const trades = ['cook', 'grower', 'carrier'] as const;
export type Trade = typeof trades[number];
type Bank = 0 | 1;
type Pair = [number, number];
export const sites = [
  { name: 'Kitchen yard', bank: 0, x: 29, y: 35, trade: 'cook' },
  { name: 'Market garden', bank: 0, x: 24, y: 79, trade: 'grower' },
  { name: 'Old landing', bank: 1, x: 78, y: 69, trade: 'carrier' },
  { name: 'Orchard green', bank: 0, x: 31, y: 61, trade: null },
  { name: 'Bridge meadow', bank: 1, x: 69, y: 45, trade: null },
  { name: 'Willow common', bank: 1, x: 79, y: 31, trade: null }
] as const;
export const occupations = {
  cook: { name: 'Cook', species: 'Field mouse', place: 'kitchen', building: 'kitchen', work: 'Turns grain into meals for this bank.' },
  grower: { name: 'Grower', species: 'Hare', place: 'garden', building: 'garden', work: 'Grows grain and fills the local storehouse.' },
  carrier: { name: 'Carrier', species: 'Otter', place: 'freight yard', building: 'depot', work: 'Brings extra grain and meals across to this bank.' }
};
export interface Settlement { trade: Trade; site: number }
export interface Thought { id: string; body: string; settlement?: Settlement }
export interface RiverClock { day: number; at: number; grain: Pair; traffic: number[] }
export interface RiverJournal<T extends Thought = Thought> { entries: T[]; river?: RiverClock }
export const shiftSeconds = 180;

export function suggest(text: string): Trade {
  const food = text.match(/\b(?:meal|eat|ate|cook\w*|tea|soup|dinner|lunch|breakfast|bake\w*|bread|kitchen|share\w*|family|together|friend\w*)\b/gi)?.length ?? 0;
  const travel = text.match(/\b(?:walk\w*|travel\w*|path|road|move\w*|journey|bus|train|cross\w*|trip|visit\w*|river|carry|carried|commut\w*)\b/gi)?.length ?? 0;
  return food || travel ? (food >= travel ? 'cook' : 'carrier') : 'grower';
}
export function isSettlement(value: unknown): value is Settlement {
  const s = value as Partial<Settlement> | null;
  return !!s && trades.includes(s.trade as Trade) && Number.isInteger(s.site) && s.site! >= 0 && s.site! < sites.length;
}
export function home(entry: Thought): Settlement {
  if (isSettlement(entry.settlement)) return entry.settlement;
  const trade = suggest(entry.body);
  return { trade, site: trades.indexOf(trade) };
}
export function population(entries: Thought[]) {
  const lots = sites.map(site => ({ trade: site.trade as Trade | null, workers: 0 }));
  for (const entry of entries) {
    const s = home(entry);
    lots[s.site].trade = s.trade;
    lots[s.site].workers++;
  }
  return lots;
}
export function canSettle(lots: ReturnType<typeof population>, s: Settlement) {
  return lots[s.site].trade === null || lots[s.site].trade === s.trade;
}
export function residentName(id: string) {
  const names = ['Sorrel', 'Moss', 'Wren', 'Clover', 'Ash', 'Bramble', 'Pip', 'Fern', 'Iris', 'Rowan', 'Reed', 'Hazel', 'Flint', 'Elm', 'Sage', 'Alder'];
  let n = 0;
  for (const ch of id) n = (Math.imul(n, 31) + ch.charCodeAt(0)) >>> 0;
  return names[n % names.length] + ' ' + ['Brook', 'Thistle', 'Aster', 'Rush', 'Vale', 'Briar', 'Hollow', 'Field'][Math.floor(n / 16) % 8];
}
export function firstMorning(at: number): RiverClock {
  return { day: 1, at, grain: [2, 1], traffic: sites.map(() => 0) };
}
export function workday(lots: ReturnType<typeof population>, grain: Pair) {
  const demand: Pair = [5, 7], harvest: Pair = [8, 1], ovens: Pair = [5, 1], capacity: Pair = [1, 2];
  const activity = sites.map(() => 0);
  lots.forEach(({ trade, workers }, i) => {
    const bank = sites[i].bank;
    demand[bank] += workers;
    if (trade === 'grower') harvest[bank] += workers * 3;
    if (trade === 'cook') ovens[bank] += workers * 3;
    if (trade === 'carrier') capacity[bank] += workers * 3;
  });
  const stock: Pair = [grain[0] + harvest[0], grain[1] + harvest[1]];
  const grainMoved: Pair = [0, 0], mealsMoved: Pair = [0, 0];
  for (const bank of [0, 1] as const) {
    const other: Bank = bank === 0 ? 1 : 0;
    const localNeed = Math.min(ovens[bank], Math.ceil(demand[bank] / 2));
    const reserve = Math.min(ovens[other], Math.ceil(demand[other] / 2));
    const moved = Math.min(capacity[bank], Math.max(0, localNeed - stock[bank]), Math.max(0, stock[other] - reserve));
    stock[bank] += moved; stock[other] -= moved; grainMoved[bank] = moved;
  }
  const meals: Pair = [0, 0], cooked: Pair = [0, 0];
  for (const bank of [0, 1] as const) {
    const used = Math.min(ovens[bank], stock[bank]);
    stock[bank] -= used; cooked[bank] = meals[bank] = used * 2;
  }
  for (const bank of [0, 1] as const) {
    const other: Bank = bank === 0 ? 1 : 0;
    const moved = Math.min(capacity[bank] - grainMoved[bank], Math.max(0, demand[bank] - meals[bank]), Math.max(0, meals[other] - demand[other]));
    meals[bank] += moved; meals[other] -= moved; mealsMoved[bank] = moved;
  }
  const fed: Pair = [Math.min(meals[0], demand[0]), Math.min(meals[1], demand[1])];
  lots.forEach(({ trade, workers }, i) => {
    const bank = sites[i].bank;
    const staff = workers + (sites[i].trade ? 1 : 0);
    if (trade === 'grower') activity[i] = staff;
    if (trade === 'cook') activity[i] = Math.min(staff, cooked[bank] / 2);
    if (trade === 'carrier') activity[i] = Math.min(staff, grainMoved[bank] + mealsMoved[bank]);
  });
  const remaining: Pair = [Math.min(24, stock[0]), Math.min(24, stock[1])];
  return { demand, harvest, cooked, fed, grainMoved, mealsMoved, remaining, activity };
}
export function advance(clock: RiverClock, lots: ReturnType<typeof population>, days: number): RiverClock {
  let grain: Pair = [...clock.grain], traffic = [...clock.traffic];
  for (let left = days; left > 0;) {
    const shift = workday(lots, grain);
    const span = shift.remaining[0] === grain[0] && shift.remaining[1] === grain[1] ? left : 1;
    traffic = traffic.map((visits, i) => Math.min(100, visits + shift.activity[i] * span));
    grain = shift.remaining; left -= span;
  }
  return { day: clock.day + days, at: clock.at + days * shiftSeconds, grain, traffic };
}
export function morning(journal: RiverJournal, at: number) {
  const clock = journal.river ?? firstMorning(at);
  const days = Math.max(0, Math.floor((at - clock.at) / shiftSeconds));
  return days ? advance(clock, population(journal.entries), days) : clock;
}
export function nextMorning(journal: RiverJournal, expected: number, at: number) {
  const clock = morning(journal, at);
  if (clock.day !== expected) return clock;
  return { ...advance(clock, population(journal.entries), 1), at };
}
