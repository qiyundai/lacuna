import type { RiverDistrict } from './river-neighborhoods.js';

const originalSites = {
  houses: ['Riverside houses', 'residential'], steps: ['The steps', 'residential'],
  terraces: ['The terraces', 'residential'], crescent: ['The crescent', 'residential'],
  apartments: ['The apartments', 'residential'], market: ['The market', 'exchange'],
  warehouse: ['The warehouse', 'works'], crane: ['The dock crane', 'works'],
  pines: ['The pine grove', 'gardens'], glasshouse: ['The glasshouse', 'gardens'],
  station: ['The station', 'civic'], civic: ['The town hall', 'civic'],
  belfry: ['The belfry', 'civic'], towers: ['The towers', 'residential'],
  arches: ['The arches', 'civic'], wharf: ['The wharf', 'exchange'], beacon: ['The beacon', 'works']
} as const satisfies Record<string, readonly [string, RiverDistrict]>;

function venue(name: string, district: RiverDistrict, after: number, lanes: number[]) {
  return { name, district, after, lanes };
}

export const riverVenues = {
  bakery: venue('The riverside bakery', 'exchange', 1, [1, 2, 3]),
  tearoom: venue('The tea room', 'exchange', 1, [0, 1, 2]),
  cottages: venue('The garden cottages', 'residential', 1, [0, 1, 2]),
  pottery: venue('The pottery', 'works', 2, [1, 2, 3]),
  bindery: venue('The bookbindery', 'works', 3, [0, 1, 2]),
  cooperage: venue('The cooperage', 'works', 3, [2, 3]),
  atelier: venue('The artists’ lodgings', 'residential', 4, [0, 1, 2]),
  sailLoft: venue('The sail loft', 'works', 5, [2, 3]),
  postOffice: venue('The post office', 'civic', 6, [1, 2, 3]),
  boathouse: venue('The rowing club', 'exchange', 8, [2, 3]),
  orangery: venue('The orangery', 'gardens', 10, [0, 1]),
  clockmaker: venue('The clockmaker’s', 'exchange', 12, [0, 1, 2]),
  library: venue('The lending library', 'civic', 15, [0, 1, 2]),
  bathhouse: venue('The public baths', 'civic', 18, [1, 2, 3]),
  musicHall: venue('The music hall', 'civic', 24, [1, 2]),
  observatory: venue('The hill observatory', 'civic', 32, [0, 1])
};

export type RiverVenue = keyof typeof riverVenues;
type OriginalSite = keyof typeof originalSites;
export type Architecture = OriginalSite | RiverVenue;
export const venueKinds = Object.keys(riverVenues) as RiverVenue[];
export const frontage: readonly Architecture[] = [...Object.keys(originalSites) as OriginalSite[], ...venueKinds];

export function isRiverVenue(kind: Architecture): kind is RiverVenue {
  return Object.hasOwn(riverVenues, kind);
}

export function siteName(kind: Architecture) {
  return isRiverVenue(kind) ? riverVenues[kind].name : originalSites[kind][0];
}

export function siteDistrict(kind: Architecture) {
  return isRiverVenue(kind) ? riverVenues[kind].district : originalSites[kind][1];
}
