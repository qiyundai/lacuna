import { hashPage, type CityPage } from './city-growth.js';

export const frontage = ['houses','steps','terraces','crescent','apartments','market','warehouse','crane','pines','glasshouse','station','civic','belfry','towers','arches','wharf','beacon'] as const;
type Architecture = typeof frontage[number];
export type Site = { id:string; kind:Architecture; ferryTerminal?:boolean; x:number; y:number; width:number; mirror:boolean; lane:number; lights:number; predecessor?:Site };
export type Coast = { sites:Site[]; addresses:Map<string,Site>; latest?:Site; service:number; start:number; end:number };

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

type Parcel={column:number;lane:number};
const neighbors=[[-1,0],[1,0],[0,-1],[0,1]] as const;
const key=(column:number,lane:number)=>column*4+lane;

export function paintedCoast(entries:readonly CityPage[]):Coast {
  const sites:Site[]=[],addresses=new Map<string,Site>(),occupied=new Map<number,Site>(),front=new Map<number,Parcel>();
  const pages=[...entries].sort((a,b)=>a.created_at-b.created_at);
  let latest:Site|undefined,service=0,end=1800;
  if(!pages.length)return {sites,addresses,service,start:0,end};
  const seed=hashPage(pages[0]!.id);
  const startLane=1+(seed%2);
  front.set(key(4,startLane),{column:4,lane:startLane});
  let edge=4;
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
    const recent=sites.slice(-14).filter(site=>site.lights<3 && site.kind!=='pines');
    if(last>5 && salt%8===2 && recent.length){
      latest=recent[(salt>>>9)%recent.length]!;
      latest.lights++;addresses.set(page.id,latest);service++;continue;
    }
    let choice:Parcel|undefined,score=-Infinity,adjacent=0;
    for(const parcel of front.values()){
      const {lane,column}=parcel;
      const touching=neighbors.filter(([dc,dl])=>lane+dl>=0&&lane+dl<4&&occupied.has(key(column+dc,lane+dl))).length;
      let cell=Math.imul(column+1,0x9e3779b1)^Math.imul(lane+1,0x85ebca77)^salt;
      cell=Math.imul(cell^(cell>>>16),0x7feb352d);
      const draw=((cell^(cell>>>15))>>>0)/4294967296;
      const rank=draw+.14*touching+.065*Math.min(0,column-edge+5)+.075*Math.sin(column*.54+lane+seed%41);
      if(rank>score){score=rank;choice=parcel;adjacent=touching;}
    }
    const {column,lane}=choice!;
    const options=kinds(choice!,salt,adjacent);
    const block:Site[]=[];
    for(let c=Math.max(0,column-3);c<=column+3;c++)for(let l=0;l<4;l++){
      const neighbor=occupied.get(key(c,l));if(neighbor)block.push(neighbor);
    }
    const landmarks:Architecture[]=['station','civic','belfry','beacon','wharf','arches','towers'];
    const available=options.filter(k=>!landmarks.includes(k)||!block.some(s=>s.kind===k));
    const selection=available.length?available:options;
    const highStreet=last>14 && lane<2 && adjacent>1 && !block.some(s=>s.kind==='towers') && salt%4!==0;
    const kind:Architecture=!last?(salt%3===0?'market':'houses'):highStreet?'towers':selection[(salt>>>10)%selection.length]!;
    const x=132+column*157+((salt>>>12)%19)-9+lane*8;
    latest={id:page.id,kind,lane,x,y:0,width:101+(salt>>>18)%45,mirror:!!(salt&1),lights:0,ferryTerminal:kind==='wharf'};
    sites.push(latest);addresses.set(page.id,latest);occupied.set(key(column,lane),latest);front.delete(key(column,lane));
    for(const [dc,dl] of neighbors){
      const c=column+dc,l=lane+dl,k=key(c,l);
      if(c>=0&&l>=0&&l<4&&!occupied.has(k))front.set(k,{column:c,lane:l});
    }
    edge=Math.max(edge,column);end=Math.max(end,Math.ceil((x+latest.width*.5)/1800)*1800);
    if(latest.ferryTerminal)service++;
  }
  return {sites,latest,addresses,service,start:0,end};
}
