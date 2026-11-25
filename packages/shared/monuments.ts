import { writingDay } from './living-book.js';

export const monuments = [
  {id:'post-office', name:'Cliff Post Office', weeks:2},
  {id:'bell-yard', name:'Bell Yard', weeks:4},
  {id:'linen-exchange', name:'Linen Exchange', weeks:8},
  {id:'winter-garden', name:'Winter Garden', weeks:12},
  {id:'tide-organ', name:'Tide Organ', weeks:18}
] as const;

export type MonumentId = typeof monuments[number]['id'];

export function writingWeek(page:{created_at:number;writingDay?:number}) {return Math.floor((writingDay(page)+3)/7);}

export function writingWeeks(pages:readonly {created_at:number; writingDay?:number}[]) {
  return new Set(pages.map(writingWeek)).size;
}

export function postcardEdition(weeks:number) {
  return weeks ? 1 + monuments.filter(monument=>weeks>=monument.weeks).length : 0;
}
