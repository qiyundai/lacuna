import { hashPage } from './city-growth.js';
import { recognizeScene, type Activity, type SceneCues } from './journal-scenes.js';
import type { Coast, Site } from './painted-coast.js';
import { columnOf, districtKey } from './river-neighborhoods.js';

const catalog = {
  water:     {window: ['towel', 'foldedLinen'], frontage: ['dryingStand', 'restingChair', 'foldedSeat'], street: 'changingBench'},
  travel:    {window: ['travelBooks', 'foldedLinen'], frontage: ['restingChair', 'packedCrate', 'travelShelf'], street: 'waitingSeats'},
  meals:     {window: ['herbPot', 'breakfastTray'], frontage: ['breakfastTable', 'herbStand', 'tableForTwo'], street: 'longTable'},
  making:    {window: ['workTray', 'repairBox'], frontage: ['workTable', 'packedCrate', 'repairStool'], street: 'workTrestle'},
  growing:   {window: ['herbPot', 'seedTray'], frontage: ['pottingTable', 'herbStand', 'terracottaPot'], street: 'plantExchange'},
  gathering: {window: ['breakfastTray', 'flowerPot'], frontage: ['pairedChairs', 'tableForTwo', 'breakfastTable'], street: 'meetingCircle'},
  reading:   {window: ['openBooks', 'radio'], frontage: ['readingChair', 'bookstand', 'radioTable'], street: 'bookExchange'}
} as const;

type Family = (typeof catalog)[Activity];
export type Detail = Family['window' | 'frontage'][number] | Family['street'];
export type AddressDetail = {page: string; socket: 'window' | 'frontage'; index: number; detail: Detail};
export type CityDetails = {addresses: Map<string, AddressDetail[]>; streets: Map<number, Detail>};
type Page = {id: string; body: string};
const homes = new Set<Site['kind']>(['houses', 'terraces', 'steps', 'crescent', 'apartments']);
const variantsBySocket = {
  window: [...new Set(Object.values(catalog).flatMap(family => [...family.window] as Detail[]))],
  frontage: [...new Set(Object.values(catalog).flatMap(family => [...family.frontage] as Detail[]))]
};
const settings: Partial<Record<Detail, keyof Omit<SceneCues, 'activities'>>> = {
  breakfastTray: 'early', breakfastTable: 'early', foldedLinen: 'early', restingChair: 'outdoors',
  herbStand: 'outdoors', terracottaPot: 'outdoors', flowerPot: 'outdoors',
  pairedChairs: 'company', tableForTwo: 'company', foldedSeat: 'company'
};

function addressDetail(page: Page, site: Site, room: number, cues: SceneCues): AddressDetail | undefined {
  if (!cues.activities.length || site.kind === 'pines') return;
  const salt = hashPage('city details 1/' + page.id);
  if (salt % 5 === 0) return;
  const home = homes.has(site.kind);
  const socket = home && room % 2 === 0 ? 'window' : 'frontage';
  const index = home ? Math.floor(room / 2) : room;
  const slots = home ? 2 : 4;
  const rotation = hashPage(site.id) % slots;
  const options = [...new Set(cues.activities.flatMap(activity => [...catalog[activity][socket]] as Detail[]))]
    .filter(detail => (variantsBySocket[socket].indexOf(detail) + rotation) % slots === index);
  if (!options.length) return;
  const matching = options.filter(detail => {
    const setting = settings[detail];
    return setting && cues[setting];
  });
  const pool = matching.length && salt % 4 !== 0 ? matching : options;
  return {page: page.id, socket, index, detail: pool[(salt >>> 8) % pool.length]!};
}

export function journalDetails(coast: Coast, pages: readonly Page[], cache = new WeakMap<Page, SceneCues>()): CityDetails {
  const addresses = new Map<string, AddressDetail[]>(), streets = new Map<number, Detail>();
  const siteActivities = new Map<Site, Set<Activity>>();
  for (const page of pages) {
    const site = coast.addresses.get(page.id);
    if (!site) continue;
    const cues = cache.get(page) ?? recognizeScene(page.body);
    cache.set(page, cues);
    if (!cues.activities.length) continue;
    const activities = siteActivities.get(site) ?? new Set<Activity>();
    for (const family of cues.activities) activities.add(family);
    siteActivities.set(site, activities);
    const item = addressDetail(page, site, coast.rooms.get(page.id) ?? 0, cues);
    if (item) {
      const residents = addresses.get(site.id) ?? [];
      residents.push(item);
      addresses.set(site.id, residents);
    }
  }
  for (const residents of addresses.values()) residents.sort((a,b) => a.index - b.index || a.socket.localeCompare(b.socket));
  for (const site of coast.sites) {
    if (site.quiet) continue;
    const column = columnOf(site), {lane, bank} = site;
    const key = districtKey({column, lane, bank}), cell = coast.neighborhoods.get(key);
    if (!cell || cell.anchors.length < 3 || hashPage('street/' + key) % 3 !== 0) continue;
    const votes = new Map<Activity, number>();
    for (const anchor of cell.anchors) {
      for (const activity of siteActivities.get(anchor) ?? []) votes.set(activity, (votes.get(activity) ?? 0) + 1);
    }
    const qualified = [...votes].filter(([,count]) => count >= 3).sort(([a, n], [b, m]) =>
      m - n || hashPage(key + a) - hashPage(key + b));
    const nearby = new Set<Detail>();
    for (let x = column - 1; x <= column + 1; x++) for (let l = Math.max(0,lane - 1); l <= Math.min(3,lane + 1); l++) {
      const item = streets.get(districtKey({column: x, lane: l, bank}));
      if (item) nearby.add(item);
    }
    const family = qualified.find(([activity]) => !nearby.has(catalog[activity].street));
    if (family) streets.set(key, catalog[family[0]].street);
  }
  return {addresses, streets};
}
