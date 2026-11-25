import { hashPage } from './city-growth.js';
import { bankPosition, landHeight, laneDepth, riverWidth } from './valley-river.js';
import { bridgeStation, portalStation } from './river-passage.js';
import type { Bank, Site } from './painted-coast.js';
import type { MonumentId } from '../../../../shared/monuments.js';

export type MonumentLot={x:number;z:number;along:number;across:number;bank:Bank};
export type MonumentPlot={id:MonumentId;seed:number;lots:MonumentLot[];yaw:number};
type Rect={x:number;z:number;along:number;across:number};

function overlaps(a:Rect,b:Rect,gap:number){
  return Math.abs(a.x-b.x)<a.along+b.along+gap && Math.abs(a.z-b.z)<a.across+b.across+gap;
}

export function reservation(plot:MonumentPlot):Rect[] {
  const [a,b]=plot.lots;
  if(!b)return plot.lots;
  return [...plot.lots,{x:a!.x,z:(a!.z+b.z)/2,along:12,across:(b.z-a!.z)/2}];
}

export function reserveMonument(id:MonumentId,world:string, milestone:string,anchor:Site,sites:readonly Site[],prior:readonly MonumentPlot[]):MonumentPlot {
  const seed=hashPage(world+'/'+id+'/'+milestone);
  let state=seed;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const origin=(anchor.x-900)/12.5,crossing=bridgeStation(sites);
  const occupied=sites.map(site=>{
    const x=(site.x-900)/12.5;
    return {x,z:bankPosition(x,site.bank,site.kind==='wharf'?-.25:laneDepth(x,site.lane)+(site.setback??0)),along:Math.max(4,site.width/29),across:4};
  });
  const reserved=prior.flatMap(reservation);
  const dual=id==='linen-exchange';
  let winner:MonumentPlot|undefined,best=Infinity;
  for(let round=0;!winner;round++){
    const radius=(65+round*68);
    for(let i=0;i<128;i++){
      const x=origin+(2*random()-1)*radius;
      if(x<portalStation+38)continue;
      const bank:Bank=random()<.5?0:1,depthNoise=random();
      const layout=(side:Bank):MonumentLot=>{
        const depth=id==='tide-organ'?3.4+2*depthNoise:id==='post-office'?56+24*depthNoise:49+23*depthNoise;
        const z=bankPosition(x,side,depth);
        const along=id==='post-office'?27:id==='linen-exchange'?17:21;
        return {x,z,bank:side,along,across:id==='linen-exchange'?31:id==='tide-organ'?12:along};
      };
      const lots=dual?[layout(0),layout(1)]:[layout(bank)],a=lots[0]!;
      const tangent=-Math.atan2(bankPosition(x+1,bank,4)-bankPosition(x-1,bank,4),2);
      const yaw=dual?0:(bank?Math.PI:0)+tangent+(id==='tide-organ'?0:(random()-.5)*.85);
      const candidate={id,seed,lots,yaw},bounds=reservation(candidate);
      if((dual||id==='tide-organ') && crossing!==undefined && Math.abs(crossing-x)<22)continue;
      if(bounds.some(box=>reserved.some(other=>overlaps(box,other,7))||occupied.some(other=>overlaps(box,other,2))))continue;
      const slopes=lots.map(l=>Math.abs(landHeight(x+7,l.z)-landHeight(x-7,l.z))+Math.abs(landHeight(x,l.z+7)-landHeight(x,l.z-7)));
      let nearest=radius*2;
      for(const b of occupied)if(Math.abs(b.x-x)<nearest)nearest=Math.min(nearest,Math.hypot(b.x-x,.4*(b.z-a.z)));
      const score=.32*Math.abs(x-origin)+.30*nearest+(id==='post-office'?-1.8:1.15)*Math.max(...slopes)+(dual?.14*riverWidth(x):0)+random()*18;
      if(score<best){best=score;winner=candidate;}
    }
  }
  return winner;
}

export function parcelReserved(plots:readonly Rect[],column:number,lane:number,bank:Bank){
  const x=(132+column*157+lane*8-900)/12.5;
  const lot={x,z:bankPosition(x,bank,laneDepth(x,lane)),along:5.4,across:lane===3?6:4.8};
  return plots.some(box=>overlaps(box,lot,1));
}
