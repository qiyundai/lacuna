import { MathUtils } from 'three';
import { bankEdge, riverWidth } from './valley-river.js';
import { columnOf } from './river-neighborhoods.js';
import type { Site } from './painted-coast.js';

export const portalStation = -207;
export const hiddenStation = portalStation - 154;
export const tunnelRadius = 5.2;

export function channelCenter(station:number) {
  return bankEdge(station,0)+riverWidth(station)*.5;
}

export function bridgeStation(sites:readonly Site[]) {
  const founding=sites.find(site=>site.bank===1);
  if(!founding)return undefined;
  return (132+(columnOf(founding)-.5)*157+24-900)/12.5-1;
}

export type Berth={station:number;bank:0|1;offset:number;slope:number};

export function sailingLine(station:number,side:number,stop?:Berth,crossing?:number) {
  const width=riverWidth(station),edge=bankEdge(station,0);
  const spread=MathUtils.smoothstep(station,portalStation+3,portalStation+30);
  const channel=channelCenter(station)+side*spread*width*.075;
  let course=channel;
  if(stop){
    const along=station-stop.station;
    const quay=bankEdge(stop.station,stop.bank)+(stop.bank===0?stop.offset:-stop.offset)+along*stop.slope;
    const berth=MathUtils.clamp(quay,edge+4.4,edge+width-4.4);
    course=MathUtils.lerp(berth,channel,MathUtils.smootherstep(Math.abs(station-stop.station),1,24));
  }
  if(crossing===undefined)return course;
  const offset=Math.abs(station-crossing);
  const nearDock=stop&&Math.abs(stop.station-crossing)<18;
  const lane=nearDock?(stop.bank===0?-1.1:1.1):side*.86;
  const clear=channelCenter(crossing)+lane;
  const transition=nearDock?Math.max(6,Math.abs(stop.station-crossing)):18;
  return MathUtils.lerp(clear,course,MathUtils.smootherstep(offset,nearDock?.35:2.8,transition));
}
