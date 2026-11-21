import type { Bank, Site } from './painted-coast.js';
import { bankPosition, landHeight, laneDepth } from './valley-river.js';

export type RiverParcel = { column:number; lane:number; bank:Bank };
const districts = ['residential','gardens','exchange','works','civic'] as const;
export type RiverDistrict = typeof districts[number];
export type SharedPlace = 'courtyard'|'allotment'|'marketCourt'|'goodsYard'|'waitingGarden';
const character:Record<Site['kind'],RiverDistrict> = {
  houses:'residential', steps:'residential', terraces:'residential', crescent:'residential', apartments:'residential',
  pines:'gardens', glasshouse:'gardens', market:'exchange', wharf:'exchange', crane:'works', warehouse:'works',
  station:'civic', civic:'civic', belfry:'civic', towers:'residential', arches:'civic', beacon:'works'
};
export const districtFrontage:Record<RiverDistrict,Site['kind'][]> = {
  residential:['crescent','houses','terraces'], gardens:['pines','glasshouse','terraces'],
  exchange:['market','warehouse','houses'], works:['warehouse','crane','steps'], civic:['civic','station','apartments']
};

export const columnOf=(s:Site)=>Math.round((s.x-132-s.lane*8)/157);
export const districtKey=({column,lane,bank}:RiverParcel)=>column*10+bank*5+lane+1;
type Influence={column:number;lane:number;votes:Record<RiverDistrict,number>; density:number; access:number; anchors:Site[]};

export function influenceAround(field:Map<number,Influence>,site:Site,addition=false){
  const column=columnOf(site),district=character[site.kind];
  const strength=site.ferryTerminal?3.6:district==='residential'?1:2.2;
  for(let dc=-3;dc<=3;dc++)for(let lane=-1;lane<=3;lane++){
    const distance=Math.hypot(dc,(site.lane-lane)*.88);
    if(distance>=3.5)continue;
    const key=districtKey({column:column+dc,lane,bank:site.bank});
    let cell=field.get(key);
    if(!cell){
      cell={column:column+dc,lane,votes:{residential:0,gardens:0,exchange:0,works:0,civic:0},density:0,access:0,anchors:[]};
      field.set(key,cell);
    }
    const weight=(1-distance/3.5)**2*(addition?.38:1);
    cell.votes[district]+=weight*strength;
    cell.density+=weight;
    if(!addition){
      cell.access=Math.max(cell.access,weight*(site.ferryTerminal?1.4:site.kind==='station'?1:.38));
      if(distance<=1.5)cell.anchors.push(site);
    }
  }
}

export function districtOf(cell:Influence){
  return districts.reduce((best,d)=>cell.votes[d]>cell.votes[best]?d:best);
}

export function sharedPlace(cell:Influence|undefined){
  if(!cell || cell.anchors.length<2 || cell.density<1.15)return;
  const distance=(s:Site)=>(columnOf(s)-cell.column)**2+((s.lane-cell.lane)*.88)**2;
  const nearest=[...cell.anchors].sort((a,b)=>distance(a)-distance(b));
  const first=character[nearest[0]!.kind];
  const companion=nearest.find(s=>character[s.kind]!==first)??nearest[1]!;
  const kinds=new Set([first,character[companion.kind]]);
  let place:SharedPlace;
  if(kinds.has('exchange') && kinds.has('works'))place='goodsYard';
  else if(kinds.has('civic') && (kinds.has('exchange') || kinds.has('residential')))place='waitingGarden';
  else if(kinds.has('gardens') && kinds.has('residential'))place='allotment';
  else if(kinds.has('exchange'))place='marketCourt';
  else if(kinds.has('works'))place='goodsYard';
  else if(kinds.has('gardens'))place='allotment';
  else place='courtyard';
  return {place,stage:cell.density<2?1:cell.density<3.4?2:3};
}

export type Neighborhoods=Map<number,Influence>;

export function parcelShelf({column,lane,bank}:RiverParcel){
  const station=(132+column*157+lane*8-900)/12.5,depth=laneDepth(station,lane);
  let relief=Infinity,setback=0;
  for(const offset of lane===3?[0]:[0,1.4,-1.4]){
    const z=bankPosition(station,bank,depth+offset);
    const heights=[landHeight(station-3,z),landHeight(station+3,z),landHeight(station,z-2),landHeight(station,z+2)];
    const span=Math.max(...heights)-Math.min(...heights);
    if(span<relief){relief=span;setback=offset;}
  }
  return {relief,setback};
}

export type FerryService={departure:Site; arrival?:Site};

export function sameFerryStops(a:FerryService|undefined,b:FerryService|undefined){
  const sameLanding=(first?:Site,second?:Site)=>
    first?.id===second?.id && first?.bank===second?.bank && first?.x===second?.x;
  return sameLanding(a?.departure,b?.departure) && sameLanding(a?.arrival,b?.arrival);
}

export function ferryServices(sites:readonly Site[]):FerryService[]{
  const services:FerryService[]=[];
  const waiting:[FerryService[],FerryService[]]=[[],[]];
  for(const site of sites){
    if(!site.ferryTerminal)continue;
    const opposite=waiting[site.bank===0?1:0];
    if(opposite.length){
      const nearest=opposite.reduce((a,b)=>Math.abs(a.departure.x-site.x)<=Math.abs(b.departure.x-site.x)?a:b);
      nearest.arrival=site;
      opposite.splice(opposite.indexOf(nearest),1);
    }else{
      const route={departure:site};
      waiting[site.bank].push(route);services.push(route);
    }
  }
  return services;
}
