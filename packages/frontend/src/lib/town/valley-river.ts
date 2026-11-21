import * as T from 'three';
import type { Bank } from './painted-coast.js';

export const valleyOrigin = {x:64,z:117};

export function shoreline(station:number){
  return 8+19*Math.sin(station*.012+.65)+8*Math.sin(station*.029)-2.4*Math.cos(station*.056);
}

export function riverWidth(station:number){return 24+5*Math.sin(station*.017)+4*Math.cos(station*.031);}

export function bankEdge(station:number,bank:Bank) {
  return shoreline(station)+(bank===1?riverWidth(station):0);
}

export function bankPosition(station:number,bank:Bank,inland:number) {
  return bankEdge(station,bank)+(bank===1?inland:-inland);
}

export function laneDepth(station:number,lane:number){
  const centers=[32,21,11,1.6];
  return centers[lane]!+(3-lane)*(.75*Math.sin(station*.041+lane)+.47*Math.sin(station*.078-lane*.7));
}

export function landHeight(station:number,across:number){
  const depth=shoreline(station)-across;
  const width=riverWidth(station);
  const bank=depth>=-width*.5?depth:-width-depth;
  const side=depth>=-width*.5?0:1;
  const bar=.5+.5*Math.sin(station*.077+side*3.1+.8*Math.sin(station*.039));
  const scallop=.65*Math.sin(station*.36+side*4)+.32*Math.sin(station*.83+side);
  const tide=bank+scallop+bar*1.25;
  const wetShelf=T.MathUtils.smoothstep(tide,-3.1,-.25);
  const dryShelf=T.MathUtils.smoothstep(tide,-.25,1.2+bar*4.7);
  const low=1.2+2.2*T.MathUtils.smoothstep(bank,.8,10);
  const rise=(6.3+1.8*Math.sin(station*.031))*T.MathUtils.smoothstep(bank,8,40);
  const hills=(12+6*Math.sin(station*.019+across*.05)+5*Math.cos(across*.055-station*.022))*T.MathUtils.smoothstep(bank,37,106);
  return -2.8+2.76*wetShelf+dryShelf*(.04+low+rise+hills);
}

export function riverGround(x:number,z:number){
  return landHeight(valleyOrigin.z-z,x-valleyOrigin.x);
}

export function buildingBelt(x:number,z:number){
  const along=valleyOrigin.z-z,depth=shoreline(along)-(x-valleyOrigin.x);
  return z<260 && depth>-riverWidth(along)-42 && depth<59;
}

export function inValley(point:T.Vector3){
  return new T.Vector3(valleyOrigin.x+point.z,point.y,valleyOrigin.z-point.x);
}
