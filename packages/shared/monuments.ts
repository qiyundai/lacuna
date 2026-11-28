import { writingDay } from './living-book.js';

export const monuments = [
  {id:'post-office', name:'Cliff Post Office', weeks:2, edition:2},
  {id:'bell-yard', name:'Bell Yard', weeks:4, edition:3},
  {id:'linen-exchange', name:'Linen Exchange', weeks:8, edition:4},
  {id:'winter-garden', name:'Winter Garden', weeks:12, edition:5},
  {id:'tide-organ', name:'Tide Organ', weeks:18, edition:6},
  {id:'rain-archive', name:'Rain Archive', weeks:26, edition:8}
] as const;

export type MonumentId = typeof monuments[number]['id'];

export function writingWeek(page:{created_at:number;writingDay?:number}) {return Math.floor((writingDay(page)+3)/7);}

export function writingWeeks(pages:readonly {created_at:number; writingDay?:number}[]) {
  return new Set(pages.map(writingWeek)).size;
}

export function postcardEdition(weeks:number) {
  if(!weeks)return 0;
  let edition=1;
  for(const monument of monuments)if(weeks>=monument.weeks)edition=monument.edition;
  return edition;
}
