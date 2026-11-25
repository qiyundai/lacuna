import { citizenLife } from '$lib/town/citizens.js';
import { lifeStories } from '$lib/town/life-stories.js';
import { residentHomes } from '$lib/town/resident-lives.js';

const names = [
  'Remy Linden', 'Oren Finch', 'Idris Bell', 'Mara Costa', 'Ada Chen', 'Gil Navarro',
  'Jun Reed', 'Noor Shaw', 'Iona Hart', 'Ellis West', 'Luz Silva', 'Kit Perry'
];

export const studioHomes: typeof residentHomes = (coast, pages) => {
  const homes = residentHomes(coast, pages, true);
  const occupied = new Set(homes.map(home => home.site));
  const sites = [...new Set(coast.addresses.values())].filter(site => !site.quiet && site.kind !== 'pines');
  for (const [family, story] of lifeStories.entries()) {
    const free = sites.filter(site => !occupied.has(site));
    const site = free.find(site => story.venues.includes(site.kind)) ?? free[0];
    if (!site) break;
    occupied.add(site);
    const person = {
      id: 'studio-' + story.key, name: names[family]!, family, chapters: [], friend: story.correspondent,
      origin: site.kind, slot: null, arrival: 0, next: 0
    };
    homes.push({ resident: person.id, site, arrival: 0, life: citizenLife(person, site) });
  }
  return homes;
};
