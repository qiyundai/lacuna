import { hashPage, type CityPage } from './city-growth.js';
import { citySequence, type ForgottenAddress } from '../../../../shared/city-address.js';

import { districtFrontage, districtKey, districtOf, ferryServices, influenceAround, parcelShelf, type FerryService, type Neighborhoods, type RiverDistrict, type RiverParcel } from './river-neighborhoods.js';

export const frontage = ['houses','steps','terraces','crescent','apartments','market','warehouse','crane','pines','glasshouse','station','civic','belfry','towers','arches','wharf','beacon'] as const;
export type Bank = 0 | 1;
type Architecture = typeof frontage[number];
export type Site = { id:string; kind:Architecture; bank:Bank; ferryTerminal?:boolean; setback?:number; district?:RiverDistrict; x:number; y:number; width:number; mirror:boolean; lane:number; lights:number; quiet?:boolean; readableId?:string; litAdditions?:number; predecessor?:Site };
export type Coast = { neighborhoods:Neighborhoods; ferries:FerryService[]; sites:Site[]; addresses:Map<string,Site>; rooms:Map<string,number>; latest?:Site; service:number; start:number; end:number };

const lanes:readonly Architecture[][] = [
  ['terraces','houses','steps','pines','apartments'],
  ['crescent','apartments','houses','terraces','steps','glasshouse'],
  ['warehouse','market','steps','houses','crane','crescent'],
  ['houses','warehouse','market','wharf','crane']
];

function heightAt(contour:number[], x:number) {
  const t=Math.max(0,Math.min(11.999,x/150)),i=Math.floor(t),f=t-i;
  return contour[i]!+(contour[i+1]!-contour[i]!)*f;
}

export const waterline=[449,482,522,566,611,640,666,688,645,609,583,566,556];
export const coastlineAt=(x:number)=>heightAt(waterline,x);

type Parcel=RiverParcel;
const neighbors=[[-1,0],[1,0],[0,-1],[0,1]] as const;
const key=(column:number,lane:number,bank:Bank)=>column*8+bank*4+lane;

export function paintedCoast(entries:readonly CityPage[],forgotten:readonly ForgottenAddress[]=[]):Coast {
  const sites:Site[]=[],addresses=new Map<string,Site>(),occupied=new Map<number,Site>(),front=new Map<number,Parcel>();
  const rooms=new Map<string,number>();
  const neighborhoods:Neighborhoods=new Map(),shelves=new Map<number,ReturnType<typeof parcelShelf>>();
  const sequence=citySequence(entries,forgotten);
  const positions=new Map(sequence.map((page,i)=>[page.id,i]));
  const forgottenAfter=new Map(forgotten.map(a=>[a.id,a.forgottenAfter]));
  const occupiedUntil=new Map<Site,number>();
  const pages=sequence.sort((a,b)=>a.created_at-b.created_at);
  let latest:Site|undefined,service=0,end=1800;
  if(!pages.length)return {sites,addresses,rooms,neighborhoods,ferries:[],service,start:0,end};
  const seed=hashPage(pages[0]!.id);
  const startLane=1+(seed%2);
  front.set(key(4,startLane,0),{column:4,lane:startLane,bank:0});
  const edge:[number,number]=[4,4],bankLots:[number,number]=[0,0];
  let farFounded=false;
  const kinds=(parcel:Parcel,salt:number,adjacent:number):Architecture[]=>{
    const {lane}=parcel;
    const pool=[...lanes[lane]!];
    if(lane===3)pool.push('wharf','market','crane');
    if(adjacent>=2 && sites.length>5)pool.push('belfry','civic','station');
    if(sites.length>10 && adjacent>=1)pool.push('arches','glasshouse');
    if(lane<2 && sites.length>15)pool.push('towers','apartments','towers');
    if(lane===3 && salt%4===0)pool.push('beacon');
    return pool;
  };
  for(const page of pages){
    const salt=hashPage(page.id),last=sites.length;
    const twoBanks=page.riverEdition===2 || page.riverEdition===3;
    const emerging=page.riverEdition===3;
    const position=positions.get(page.id)!;
    const until=forgottenAfter.get(page.id)??Infinity;
    const recent=sites.slice(-14).filter(site=>site.lights<3 && site.kind!=='pines' && occupiedUntil.get(site)!>position);
    if(last>5 && salt%8===2 && recent.length){
      latest=recent[(salt>>>9)%recent.length]!;
      occupiedUntil.set(latest,Math.max(occupiedUntil.get(latest)!,until));
      latest.lights++;rooms.set(page.id,latest.lights);influenceAround(neighborhoods,latest,true);addresses.set(page.id,latest);service++;continue;
    }
    let choice:Parcel|undefined,score=-Infinity,adjacent=0;
    for(const parcel of front.values()){
      const {lane,column,bank}=parcel;
      if(bank && !twoBanks)continue;
      const touching=neighbors.filter(([dc,dl])=>lane+dl>=0&&lane+dl<4&&occupied.has(key(column+dc,lane+dl,bank))).length;
      let cell=Math.imul(column+1,0x9e3779b1)^Math.imul(lane+1,0x85ebca77)^Math.imul(bank,0x27d4eb2d)^salt;
      cell=Math.imul(cell^(cell>>>16),0x7feb352d);
      const draw=((cell^(cell>>>15))>>>0)/4294967296;
      const crossing=bank===1 && !farFounded;
      const room=twoBanks && farFounded ? .62*(1-2*bankLots[bank]!/last) : 0;
      let suitability=0;
      if(emerging){
        const id=districtKey(parcel),cell=neighborhoods.get(id);
        let shelf=shelves.get(id);
        if(!shelf){shelf=parcelShelf(parcel);shelves.set(id,shelf);}
        suitability=.42*(cell?.access??0)+.09*Math.min(3,cell?.density??0)-.24*shelf.relief;
        if(lane===3 && !farFounded)suitability+=Math.min(1,last*.09);
      }
      const rank=suitability+(crossing?1.8:0)+room+draw+.14*touching+.065*Math.min(0,column-edge[bank]!+5)+.075*Math.sin(column*.54+lane+seed%41);
      if(rank>score){score=rank;choice=parcel;adjacent=touching;}
    }
    const {column,lane,bank}=choice!;
    const options=kinds(choice!,salt,adjacent);
    const block:Site[]=[];
    for(let c=Math.max(0,column-3);c<=column+3;c++)for(let l=0;l<4;l++){
      const neighbor=occupied.get(key(c,l,bank));if(neighbor)block.push(neighbor);
    }
    if(twoBanks){
      const trade=block.filter(site=>site.ferryTerminal || site.kind==='market' || site.kind==='warehouse').length;
      const homes=block.filter(site=>site.kind==='houses' || site.kind==='terraces').length;
      if(lane>=2 && trade>=2)options.push('warehouse','market','crane');
      if(homes>=2)options.push('terraces','houses',lane<2?'apartments':'market');
    }
    const cell=neighborhoods.get(districtKey(choice!));
    const district=emerging && cell && cell.density>.75?districtOf(cell):undefined;
    if(district)options.push(...districtFrontage[district],...districtFrontage[district]);
    const landmarks:Architecture[]=['station','civic','belfry','beacon','wharf','arches','towers'];
    const available=options.filter(k=>!landmarks.includes(k)||!block.some(s=>s.kind===k));
    const selection=available.length?available:options;
    const highStreet=last>14 && lane<2 && adjacent>1 && !block.some(s=>s.kind==='towers') && salt%4!==0;
    const across:Bank=bank===0?1:0;
    const firstLanding=twoBanks && lane===3 &&
      ((!adjacent && occupied.get(key(column,3,across))?.ferryTerminal) ||
        (!farFounded && (bank===1 || (last>=4 && !block.some(s=>s.ferryTerminal)))));
    let kind=selection[(salt>>>10)%selection.length]!;
    if(!last)kind=salt%3===0?'market':'houses';
    else if(firstLanding || (emerging && lane===3 && !block.some(s=>s.ferryTerminal) &&
      (occupied.get(key(column,3,across))?.ferryTerminal || (block.length>=6 && salt%3===0))))kind='wharf';
    else if(highStreet && (!emerging || (district==='civic' || district==='residential') && adjacent>=3))kind='towers';
    const x=132+column*157+((salt>>>12)%19)-9+lane*8;
    latest={id:page.id,kind,lane,bank,x,y:0,width:101+(salt>>>18)%45,mirror:!!(salt&1),lights:0,ferryTerminal:kind==='wharf'};
    if(district)latest.district=district;
    occupiedUntil.set(latest,until);
    if(emerging && lane!==3)latest.setback=shelves.get(districtKey(choice!))!.setback;
    influenceAround(neighborhoods,latest);
    sites.push(latest);addresses.set(page.id,latest);occupied.set(key(column,lane,bank),latest);front.delete(key(column,lane,bank));
    for(const [dc,dl] of neighbors){
      const c=column+dc,l=lane+dl,k=key(c,l,bank);
      if(c>=0&&l>=0&&l<4&&!occupied.has(k))front.set(k,{column:c,lane:l,bank});
    }
    bankLots[bank]++;
    if(bank===1)farFounded=true;
    if(latest.ferryTerminal && !occupied.has(key(column,3,across)) && (!farFounded || twoBanks))
      front.set(key(column,3,across),{column,lane:3,bank:across});
    edge[bank]=Math.max(edge[bank]!,column);end=Math.max(end,Math.ceil((x+latest.width*.5)/1800)*1800);
    if(latest.ferryTerminal)service++;
  }
  const ferries=ferryServices(sites);
  if(forgotten.length){
    const residents=new Map<Site,string[]>();
    for(const [id,site] of addresses){
      if(forgottenAfter.has(id)){addresses.delete(id);rooms.delete(id);continue;}
      const ids=residents.get(site)??[];ids.push(id);residents.set(site,ids);
    }
    neighborhoods.clear();service=0;
    for(const site of sites){
      const ids=residents.get(site);
      if(!ids){site.quiet=true;site.litAdditions=0;continue;}
      site.readableId=ids[0];site.litAdditions=ids.length-1;
      influenceAround(neighborhoods,site);
      for(let i=1;i<ids.length;i++)influenceAround(neighborhoods,site,true);
      service+=site.litAdditions+Number(site.ferryTerminal);
    }
  }
  return {sites,latest,addresses,rooms,neighborhoods,ferries:ferries.filter(r=>!r.departure.quiet&&!r.arrival?.quiet),service,start:0,end};
}
