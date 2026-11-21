import {bankEdge,bankPosition,laneDepth} from './valley-river.js';
import * as T from 'three';
import { landHeight, type Workshop } from './harbor-workshop.js';
import type { Bank, Site } from './painted-coast.js';

export type DoorApproach = { threshold: T.Vector3; landing: T.Vector3; exit: T.Vector3 };
export type WaterfrontLot = { site: Site; model: T.Group; doors: DoorApproach[]; gallery: T.Vector3[] };

export function placeLot(site: Site, model: T.Group): WaterfrontLot {
  model.updateMatrixWorld(true);
  const doors: DoorApproach[] = [];
  model.traverse(node => {
    if (node.name !== 'Door threshold') return;
    const threshold = node.getWorldPosition(new T.Vector3());
    const landing = node.localToWorld(new T.Vector3(0,0,.74));
    const local = model.worldToLocal(landing.clone());
    const facing = node.getWorldDirection(new T.Vector3()).dot(model.getWorldDirection(new T.Vector3()));
    if (facing < .55) local.z = Math.max(local.z, 2.6);
    doors.push({threshold, landing, exit: model.localToWorld(local)});
  });
  const exits=doors.map(door=>model.worldToLocal(door.exit.clone()));
  const frontage=exits.reduce((max,q)=>Math.max(max,q.z),0)+.12;
  const gallery=exits.map(q=>model.localToWorld(new T.Vector3(q.x,q.y,frontage)));
  const ordered=gallery.map((point,i)=>({point,x:exits[i]!.x})).sort((a,b)=>a.x-b.x).map(item=>item.point);
  const segments: [T.Vector3,T.Vector3][]=[];
  for(const [i,door] of doors.entries()){
    segments.push([door.threshold,door.landing],[door.landing,door.exit],[door.exit,gallery[i]!]);
  }
  for(let i=1;i<ordered.length;i++) segments.push([ordered[i-1]!,ordered[i]!]);
  let lift=0;
  for(const [a,b] of segments) {
    const samples=Math.max(1,Math.ceil(a.distanceTo(b)/.36));
    for(let i=0;i<=samples;i++){
      const t=i/samples, x=T.MathUtils.lerp(a.x,b.x,t), z=T.MathUtils.lerp(a.z,b.z,t);
      lift=Math.max(lift,landHeight(x,z)+.12-T.MathUtils.lerp(a.y,b.y,t));
    }
  }
  model.position.y+=lift;
  for(const [i,{threshold,landing,exit}] of doors.entries()) {
    threshold.y+=lift; landing.y+=lift; exit.y+=lift;
    gallery[i]!.y+=lift;
  }
  return {site,model,doors,gallery};

}

export function streetLine(lots: WaterfrontLot[], lane: number, junctions: number[] = []) {
  const bank=lots[0]?.site.bank??0, outward=bank===0?1:-1;
  const doors = lots.flatMap(lot => lot.doors);
  const xs = lots.map(lot => lot.model.position.x).concat(doors.map(d => d.exit.x));
  if (!xs.length) return [];
  const first = Math.min(Math.min(...xs)-2.1,...junctions), last = Math.max(Math.max(...xs)+2.1,...junctions);
  const segments = Math.ceil((last-first)/.42);
  const dx = (last-first)/segments;
  const line: T.Vector3[] = [];
  for (let i=0; i<=segments; i++) {
    const x = first+i*dx;
    let offset = -laneDepth(x,lane)+4.6;
    const elevation = .95;
    for (const {exit} of doors) {
      const distance = Math.abs(x-exit.x);
      offset = Math.max(offset, outward*(exit.z-bankEdge(exit.x,bank))+1.42-distance*.55);

    }
    const z = bankPosition(x,bank,-offset);
    const ground = Math.max(landHeight(x,z-.73),landHeight(x,z),landHeight(x,z+.73));
    line.push(new T.Vector3(x,Math.max(elevation,ground+.16),z));
  }
  for (let i=1;i<line.length;i++) line[i]!.y = Math.max(line[i]!.y,line[i-1]!.y-dx*.43);
  for (let i=line.length-2;i>=0;i--) line[i]!.y = Math.max(line[i]!.y,line[i+1]!.y-dx*.43);
  return line;
}


function horizontal(a: T.Vector3, b: T.Vector3) {
  return Math.hypot(b.x-a.x,b.z-a.z);
}

function rail(shop: Workshop, group: T.Group, a: T.Vector3, b: T.Vector3) {
  const delta = b.clone().sub(a);
  const mid = a.clone().lerp(b,.5);
  const bar = shop.box(group,'iron',mid.x,mid.y,mid.z,.043,delta.length(),.043);
  bar.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
}

function landingArcade(shop: Workshop, group: T.Group, a: T.Vector3, b: T.Vector3, width: number) {
  const length=horizontal(a,b), top=Math.min(a.y,b.y)-.14;
  const spans=Math.max(1,Math.round(length/2.15));
  const span=length/spans, rise=Math.min(.97,span*.42);
  for(let i=0;i<=spans*2;i++) {
    const q=a.clone().lerp(b,i/(spans*2));
    if(top-landHeight(q.x,q.z)<rise+.30) return false;
  }
  const angle=Math.atan2(a.z-b.z,b.x-a.x);
  for(let i=0;i<spans;i++) {
    const q=a.clone().lerp(b,(i+.5)/spans);
    shop.piece(group,shop.geometries.arcade,'ashlar',q.x,top,q.z,span,rise,width,angle);
  }
  for(let i=0;i<=spans;i++) {
    const q=a.clone().lerp(b,i/spans);
    const low=landHeight(q.x,q.z)-.65;
    const h=top-rise-low;
    const pier=shop.box(group,'ashlar',q.x,low+h/2,q.z,span*.25,h,width);
    pier.rotation.y=angle;
    const capital=shop.box(group,'coping',q.x,top-rise,q.z,span*.30,.085,width+.06);
    capital.rotation.y=angle;
  }
  return true;
}

function pavedRun(shop: Workshop, group: T.Group, a: T.Vector3, b: T.Vector3, steps: boolean, walkWidth=.79) {
  const length = horizontal(a,b);
  if (length < .015) return;
  const direction = new T.Vector3(b.x-a.x,0,b.z-a.z).normalize();
  const angle = Math.atan2(direction.x,direction.z);
  const side = new T.Vector3(direction.z,0,-direction.x).multiplyScalar(walkWidth*.46);
  const rise = b.y-a.y;
  const vaulted=length>1.42 && Math.abs(rise)<.55 && landingArcade(shop,group,a,b,walkWidth);
  const count = Math.max(1, Math.ceil(length/.72), steps ? Math.ceil(Math.abs(rise)/.145) : 1);
  const rests = steps ? Math.floor((count-1)/12) : 0;
  const extra = Math.min(.63, Math.max(0,(length-count*.245)/Math.max(1,rests)));
  const going=(length-rests*extra)/count;
  let distance=0;
  const handrail: T.Vector3[]=[a.clone().add(side)];
  const exposed = Math.abs(rise)>.46 || a.y-landHeight(a.x,a.z)>.66 || b.y-landHeight(b.x,b.z)>.66;
  for (let i=0;i<count;i++) {
    const rest=steps && (i+1)%12===0 && i<count-1;
    const tread=going+(rest?extra:0);
    const q=a.clone().lerp(b,(distance+tread/2)/length);
    const top=steps ? a.y+rise*(i+.5)/count : q.y;
    if (rest) {
      const start=a.clone().lerp(b,distance/length).add(side);
      const end=a.clone().lerp(b,(distance+tread)/length).add(side);
      start.y=end.y=top;
      handrail.push(start,end);
    }
    distance+=tread;
    const bottom=vaulted?Math.min(a.y,b.y)-.16:Math.min(top-.18,landHeight(q.x+side.x,q.z+side.z)-.14,landHeight(q.x-side.x,q.z-side.z)-.14);
    const stone=shop.box(group,'ashlar',q.x,(top+bottom)/2-.026,q.z,walkWidth,top-bottom,tread+.024);
    stone.rotation.y=angle;
    const cap=shop.box(group,'coping',q.x,top-.026,q.z,walkWidth+.035,.052,tread+.024);
    cap.rotation.y=angle;
  }
  if (!exposed) return;
  handrail.push(b.clone().add(side));
  for(let i=1;i<handrail.length;i++) {
    const left=handrail[i-1]!.clone(), right=handrail[i]!.clone();
    const posts=Math.max(1,Math.ceil(horizontal(left,right)/1.25));
    for(let j=i===1?0:1;j<=posts;j++) {
      const q=left.clone().lerp(right,j/posts);
      shop.box(group,'iron',q.x,q.y+.26,q.z,.045,.54,.045);
    }
    left.y+=.53; right.y+=.53;
    rail(shop,group,left,right);
  }
}

export function doorRoute(exit: T.Vector3, street: T.Vector3[]) {
  let best=street[0]!, cost=Infinity;
  for(const point of street) {
    const run=horizontal(exit,point);
    const rise=Math.abs(exit.y-point.y);
    const steps=Math.ceil(rise/.145);
    const steepness=Math.max(0,steps*.255+Math.max(0,Math.floor((steps-1)/12))*.63-run);
    let buried=0;
    for(let t=.16;t<1;t+=.16) {
      const x=T.MathUtils.lerp(exit.x,point.x,t), z=T.MathUtils.lerp(exit.z,point.z,t);
      buried=Math.max(buried,landHeight(x,z)+.06-T.MathUtils.lerp(exit.y,point.y,t));
    }
    const score=run+100*steepness+75*buried;
    if(score<cost) {best=point;cost=score;}
  }
  return {origin:exit,target:best,cost};
}

export function connectDoors(shop: Workshop, group: T.Group, lot: WaterfrontLot, street: T.Vector3[]) {
  if (!lot.doors.length) return;
  const {model,doors,gallery}=lot;
  for (const [i,door] of doors.entries()) {
    pavedRun(shop,group,door.threshold,door.landing,false);
    pavedRun(shop,group,door.landing,door.exit,false);
    pavedRun(shop,group,door.exit,gallery[i]!,false);
  }
  const ordered=[...gallery].sort((a,b)=>model.worldToLocal(a.clone()).x-model.worldToLocal(b.clone()).x);
  for(let i=1;i<ordered.length;i++) pavedRun(shop,group,ordered[i]!,ordered[i-1]!,true);
  const first=doorRoute(ordered[0]!,street);
  const last=ordered.length>1?doorRoute(ordered[ordered.length-1]!,street):first;
  const chosen=first.cost<=last.cost?first:last;
  pavedRun(shop,group,chosen.origin,chosen.target,true);
}

export function streetFurniture(shop: Workshop, group: T.Group, line: T.Vector3[]) {
  for (let i=0; i<line.length; i+=6) {
    const q=line[i]!, end=line[Math.min(i+6,line.length-1)]!;
    const previous=line[Math.max(0,i-1)]!;
    const axis=end.clone().sub(previous);
    const side=new T.Vector3(-axis.z,0,axis.x).normalize();
    const h=landHeight(q.x,q.z);
    if (h<.8 && q.y-h>.35) {
      const low=Math.min(h,landHeight(q.x+side.x*.6,q.z+side.z*.6),landHeight(q.x-side.x*.6,q.z-side.z*.6))-.35;
      const pier=shop.box(group,'ashlar',q.x,(q.y+low)/2-.14,q.z,1.26,q.y-low,.66);
      pier.rotation.y=Math.atan2(axis.x,axis.z);
    }
    if (q.y-landHeight(q.x+side.x*.9,q.z+side.z*.9)>.60 && end!==q) {
      const a=q.clone().addScaledVector(side,.66), b=end.clone().addScaledVector(side,.66);
      for (const point of [a,b]) shop.box(group,'iron',point.x,point.y+.27,point.z,.054,.54,.054);
      a.y+=.53;b.y+=.53;
      rail(shop,group,a,b);
    }
    if (i%18===6) shop.lantern(group,q.x+side.x*.58,q.y,q.z+side.z*.58,.80);
  }
}

export function hillsidePassage(shop: Workshop, group: T.Group, a: T.Vector3, b: T.Vector3, bank:Bank) {
  const length=horizontal(a,b);
  if (length<.10) return;
  let route: T.Vector3[]=[];
  for (const reach of [1.0,3,6,10,15]) {
    const count=Math.ceil((length+reach*2)/.55);
    route=Array.from({length:count+1},(_,i)=>{
      const t=i/count;
      const q=a.clone().lerp(b,t);
      const shift=-reach*Math.sin(Math.PI*t);
      q.z+=bankEdge(q.x+shift,bank)-bankEdge(q.x,bank);
      q.x+=shift;
      q.y=landHeight(q.x,q.z)+.20;
      return q;
    });
    route[0]=a.clone();route[count]=b.clone();
    for (let i=1;i<=count;i++) {
      const q=route[i]!,prev=route[i-1]!;
      q.y=Math.max(q.y, prev.y-horizontal(q,prev)*.46);
    }
    for (let i=count-1;i>=0;i--) {
      const q=route[i]!,next=route[i+1]!;
      q.y=Math.max(q.y, next.y-horizontal(q,next)*.46);
    }
    if(route[0]!.y-a.y<.045 && route[count]!.y-b.y<.045) break;
  }
  route[0]=a;route[route.length-1]=b;
  for(let i=1;i<route.length;i++) pavedRun(shop,group,route[i-1]!,route[i]!,true,1.08);
}
