import {bankEdge,bankPosition,laneDepth} from './valley-river.js';
import * as T from 'three';
import { landHeight, type Workshop } from './harbor-workshop.js';
import type { Bank, Site } from './painted-coast.js';
import { columnOf } from './river-neighborhoods.js';

export type DoorApproach = { threshold: T.Vector3; landing: T.Vector3; exit: T.Vector3 };
export type WaterfrontLot = { site: Site; model: T.Group; doors: DoorApproach[]; gallery: T.Vector3[] };

function reserveBridgeFrontage(model:T.Group,station:number){
  const gap=model.position.x-station;
  if(Math.abs(gap)>13)return;
  model.updateMatrixWorld(true);
  const local=model.matrixWorld.clone().invert(),toward=Math.sign(gap);
  const cosine=Math.cos(model.rotation.y),sine=Math.sin(model.rotation.y);
  const corner=new T.Vector3();
  let width=1;
  model.traverse(part=>{
    if(!(part instanceof T.Mesh))return;
    if(!part.geometry.boundingBox)part.geometry.computeBoundingBox();
    const box=part.geometry.boundingBox!;
    const frame=local.clone().multiply(part.matrixWorld);
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      corner.set(x,y,z).applyMatrix4(frame);
      const reach=-toward*corner.x*cosine;
      if(reach<=0)continue;
      width=Math.min(width,(Math.abs(gap)+toward*corner.z*sine-1.25)/reach);
    }
  });
  model.scale.x*=T.MathUtils.clamp(width,.55,1);
}

export function placeLot(site: Site, model: T.Group,crossing?:number): WaterfrontLot {
  if(crossing!==undefined&&(site.lane===3||site.kind==='wharf'))reserveBridgeFrontage(model,crossing);
  model.updateMatrixWorld(true);
  const doors: DoorApproach[] = [];
  model.traverse(node => {
    if (node.name !== 'Door threshold') return;
    const threshold = node.getWorldPosition(new T.Vector3());
    const landing = node.localToWorld(new T.Vector3(0,0,.74));
    const local = model.worldToLocal(landing.clone());
    const facing = node.getWorldDirection(new T.Vector3()).dot(model.getWorldDirection(new T.Vector3()));
    if (facing < .55 && site.kind!=='wharf') local.z = Math.max(local.z, 2.6);
    doors.push({threshold, landing, exit: model.localToWorld(local)});
  });
  const exits=doors.map(door=>model.worldToLocal(door.exit.clone()));
  const toward=site.kind==='wharf'?-1:1;
  const frontage=toward*(exits.reduce((max,q)=>Math.max(max,toward*q.z),0)+.12);
  const gallery=exits.map(q=>model.localToWorld(new T.Vector3(q.x,q.y,frontage)));
  const ordered=gallery.map((point,i)=>({point,x:exits[i]!.x})).sort((a,b)=>a.x-b.x).map(item=>item.point);
  const segments: [T.Vector3,T.Vector3][]=[];
  for(const [i,door] of doors.entries()){
    segments.push([door.threshold,door.landing],[door.landing,door.exit],[door.exit,gallery[i]!]);
  }
  for(let i=1;i<ordered.length;i++) segments.push([ordered[i-1]!,ordered[i]!]);
  if(site.kind==='wharf'){
    for(const [i,door] of doors.entries()){
      door.landing.y=Math.max(door.landing.y,landHeight(door.landing.x,door.landing.z)+.10);
      door.exit.y=door.landing.y;
      gallery[i]!.y=door.exit.y;
    }
    return {site,model,doors,gallery};
  }
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
  const wharves=lots.filter(lot=>lot.site.kind==='wharf');
  const doors = lots.filter(lot=>lot.site.kind!=='wharf').flatMap(lot => lot.doors);
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
    for(const wharf of wharves){
      const half=wharf.site.ferryTerminal?5.4:3.24;
      const end=Math.max(0,Math.abs(x-wharf.model.position.x)-half-.8);
      offset=Math.min(offset,-4.75+end*.85);
    }
    const z = bankPosition(x,bank,-offset);
    const ground = Math.max(landHeight(x,z-.73),landHeight(x,z),landHeight(x,z+.73));
    line.push(new T.Vector3(x,Math.max(elevation,ground+.16),z));
  }
  for (let i=1;i<line.length;i++) line[i]!.y = Math.max(line[i]!.y,line[i-1]!.y-dx*.43);
  for (let i=line.length-2;i>=0;i--) line[i]!.y = Math.max(line[i]!.y,line[i+1]!.y-dx*.43);
  return line;
}


export function neighborhoodPassages(lots:WaterfrontLot[],streets:T.Vector3[][]){
  const blocks=new Map<number,Map<number,Site>>();
  for(const {site} of lots){
    const column=columnOf(site),lanes=blocks.get(column)??new Map<number,Site>();
    lanes.set(site.kind==='wharf'?3:site.lane,site);blocks.set(column,lanes);
  }
  const candidates:{lane:number;x:number;above:T.Vector3;below:T.Vector3;cost:number}[]=[];
  for(const [column,lanes] of blocks)for(const [lane,site] of lanes){
    const neighbor=lanes.get(lane+1);
    if(!neighbor)continue;
    const x=(132+(column+.5)*157+12-900)/12.5;
    const nearest=(line:T.Vector3[])=>{
      const first=line[0]!,last=line.at(-1)!;
      const index=Math.round((line.length-1)*(x-first.x)/(last.x-first.x));
      return line[T.MathUtils.clamp(index,0,line.length-1)]!;
    };
    const above=nearest(streets[lane]!),below=nearest(streets[lane+1]!);
    if(Math.abs(above.x-x)>.5 || Math.abs(below.x-x)>.5)continue;
    const rise=Math.abs(above.y-below.y),run=Math.max(1,Math.abs(above.z-below.z));
    const busy=neighbor.ferryTerminal||site.kind==='station'||neighbor.kind==='market';
    candidates.push({lane,x,above,below,cost:rise/run-(busy?.45:0)});
  }
  const selected:typeof candidates=[];
  for(const candidate of candidates.sort((a,b)=>a.cost-b.cost||a.x-b.x)){
    if(!selected.some(other=>other.lane===candidate.lane && Math.abs(other.x-candidate.x)<30))selected.push(candidate);
  }
  return selected;
}

function horizontal(a: T.Vector3, b: T.Vector3) {
  return Math.hypot(b.x-a.x,b.z-a.z);
}

type RailObstacle={inverse:T.Matrix4;bounds:T.Box2};

export function railClearance(lots:WaterfrontLot[]){
  const obstacles:RailObstacle[]=[];
  function opening(a:T.Vector3,b:T.Vector3,width:number){
    const center=a.clone().lerp(b,.5),delta=b.clone().sub(a);
    const frame=new T.Matrix4().makeRotationY(Math.atan2(delta.x,delta.z)).setPosition(center);
    const radius=Math.max(.22,Math.hypot(delta.x,delta.z)/2+.12);
    obstacles.push({inverse:frame.invert(),bounds:new T.Box2(new T.Vector2(-width/2,-radius),new T.Vector2(width/2,radius))});
  }
  for(const {model,site,doors} of lots){
    if(site.kind==='pines')continue;
    model.updateMatrixWorld(true);
    const inverse=model.matrixWorld.clone().invert(),bounds=new T.Box3();
    model.traverse(node=>{
      if(!(node instanceof T.Mesh))return;
      if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
      const frame=inverse.clone().multiply(node.matrixWorld);
      bounds.union(node.geometry.boundingBox!.clone().applyMatrix4(frame));
    });
    obstacles.push({inverse,bounds:new T.Box2(new T.Vector2(bounds.min.x-.09,bounds.min.z-.09),new T.Vector2(bounds.max.x+.09,bounds.max.z+.09))});
    for(const door of doors)opening(door.threshold,door.exit,1.04);
  }
  function sections(a:T.Vector3,b:T.Vector3){
    const cuts:[number,number][]=[];
    for(const {inverse,bounds} of obstacles){
      const from=a.clone().applyMatrix4(inverse),to=b.clone().applyMatrix4(inverse);
      let lo=0,hi=1;
      for(const [axis,low,high] of [['x',bounds.min.x,bounds.max.x],['z',bounds.min.y,bounds.max.y]] as const){
        const delta=to[axis]-from[axis];
        if(Math.abs(delta)<1e-8){if(from[axis]<low||from[axis]>high)hi=-1;continue;}
        const t0=(low-from[axis])/delta,t1=(high-from[axis])/delta;
        lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
      }
      if(lo<hi)cuts.push([lo,hi]);
    }
    const spans:[number,number][]=[];
    let cursor=0;
    for(const [lo,hi] of cuts.sort((l,r)=>l[0]-r[0])){
      if(lo>cursor)spans.push([cursor,lo]);cursor=Math.max(cursor,hi);
    }
    if(cursor<1)spans.push([cursor,1]);
    return spans;
  }
  return {sections,opening};
}
type RailClearance=ReturnType<typeof railClearance>;

export function bridgeApproach(foot:T.Vector3,front:T.Vector3[],inland:T.Vector3[],clearance:RailClearance){
  let best:{from:T.Vector3;to:T.Vector3;cost:number}|undefined;
  const nearby=front.filter((p,i)=>Math.abs(p.x-foot.x)<7&&i%3===0);
  for(const from of [foot,...nearby])for(const [i,to] of inland.entries()){
    if(i%3!==0||Math.abs(to.x-from.x)>8)continue;
    const run=horizontal(from,to);
    if(run<.5)continue;
    const cost=2*from.distanceTo(foot)+run+Math.abs(to.x-from.x)+Math.max(0,Math.abs(to.y-from.y)-run*.54)*10;
    if(best&&cost>=best.cost)continue;
    const side=new T.Vector3(to.z-from.z,0,from.x-to.x).multiplyScalar(.54/run);
    if([-1,0,1].some(sign=>{
      const a=from.clone().addScaledVector(side,sign),b=to.clone().addScaledVector(side,sign);
      return !clearance.sections(a,b).some(([lo,hi])=>lo===0&&hi===1);
    }))continue;
    best={from,to,cost};
  }
  return best;
}

function guardrail(shop:Workshop,group:T.Group,a:T.Vector3,b:T.Vector3,clearance?:RailClearance){
  for(const [lo,hi] of clearance?.sections(a,b)??[[0,1]]){
    const left=a.clone().lerp(b,lo),right=a.clone().lerp(b,hi);
    const delta=right.clone().sub(left),length=delta.length();
    if(length<.12)continue;
    const posts=Math.max(1,Math.ceil(length/1.4));
    for(let j=0;j<=posts;j++){
      const q=left.clone().lerp(right,j/posts);
      shop.box(group,'iron',q.x,q.y+.26,q.z,.048,.54,.048);
    }
    const mid=left.lerp(right,.5);
    const bar=shop.box(group,'iron',mid.x,mid.y+.53,mid.z,.043,length,.043);
    bar.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());
  }
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

export function pavedRun(shop: Workshop, group: T.Group, a: T.Vector3, b: T.Vector3, steps: boolean, walkWidth=.79,clearance?:RailClearance) {
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
    guardrail(shop,group,handrail[i-1]!,handrail[i]!,clearance);
  }
}

export function doorRoute(exit: T.Vector3, street: T.Vector3[]) {
  function approachCost(point:T.Vector3){
    const run=horizontal(exit,point);
    const rise=Math.abs(exit.y-point.y);
    const steps=Math.ceil(rise/.145);
    const steepness=Math.max(0,steps*.255+Math.max(0,Math.floor((steps-1)/12))*.63-run);
    let buried=0;
    for(let t=.16;t<1;t+=.16) {
      const x=T.MathUtils.lerp(exit.x,point.x,t), z=T.MathUtils.lerp(exit.z,point.z,t);
      buried=Math.max(buried,landHeight(x,z)+.06-T.MathUtils.lerp(exit.y,point.y,t));
    }
    return run+100*steepness+75*buried;
  }
  let best=street[0]!;
  for(const point of street)if(Math.abs(point.x-exit.x)<Math.abs(best.x-exit.x))best=point;
  const upperBound=best?approachCost(best):Infinity;
  let cost=Infinity;
  for(const point of street){
    if(Math.abs(point.x-exit.x)>Math.min(cost,upperBound))continue;
    const score=approachCost(point);
    if(score<cost){best=point;cost=score;}
  }
  return {origin:exit,target:best,cost};
}

export function connectDoors(shop: Workshop, group: T.Group, lot: WaterfrontLot, street: T.Vector3[],clearance?:RailClearance) {
  if (!lot.doors.length) return;
  const {model,doors,gallery}=lot;
  for (const [i,door] of doors.entries()) {
    pavedRun(shop,group,door.threshold,door.landing,lot.site.kind==='wharf',.79,clearance);
    pavedRun(shop,group,door.landing,door.exit,false,.79,clearance);
    pavedRun(shop,group,door.exit,gallery[i]!,false,.79,clearance);
  }
  const ordered=[...gallery].sort((a,b)=>model.worldToLocal(a.clone()).x-model.worldToLocal(b.clone()).x);
  for(let i=1;i<ordered.length;i++) pavedRun(shop,group,ordered[i]!,ordered[i-1]!,true,.79,clearance);
  const first=doorRoute(ordered[0]!,street);
  const last=ordered.length>1?doorRoute(ordered[ordered.length-1]!,street):first;
  const chosen=first.cost<=last.cost?first:last;
  pavedRun(shop,group,chosen.origin,chosen.target,true,.79,clearance);
}

export function streetFurniture(shop: Workshop, group: T.Group, line: T.Vector3[],clearance?:RailClearance) {
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
      guardrail(shop,group,a,b,clearance);
    }
    if(i%18===6){
      const foot=q.clone().addScaledVector(side,.58);
      if(!clearance||clearance.sections(foot,foot).length)shop.lantern(group,foot.x,foot.y,foot.z,.80);
    }
  }
}

export function hillsidePassage(shop: Workshop, group: T.Group, a: T.Vector3, b: T.Vector3, bank:Bank,clearance?:RailClearance) {
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
  for(let i=1;i<route.length;i++) pavedRun(shop,group,route[i-1]!,route[i]!,true,1.08,clearance);
}
