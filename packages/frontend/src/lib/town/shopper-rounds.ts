import * as T from 'three';
import type { Site } from './painted-coast.js';
import { siteDistrict, siteName } from './architecture-catalog.js';

import { tomas, type Errand, type Gesture, type ResidentLife } from './resident-lives.js';

export type ShopperGesture = Gesture;
type Point = T.Vector3;
export type ShopFront = {site:Site; origin:Point; target:Point};
type Visit = {place:string; point:Point; activity:Errand; site?:Site; memory?:string};
type Leg = {path:T.CurvePath<Point>; ticks:number; walk:number; wait:number; visit:Visit};
export const turnTicks=20;
const easeTicks=4,stepLength=.039;
export const walkingTicks=(length:number,stride=1)=>Math.ceil(length/(stepLength*stride))+easeTicks;

export function walkingPose(tick:number, length:number,stride=1) {
  const ticks=walkingTicks(length,stride), t=Math.min(tick,ticks),ramp=Math.min(easeTicks,ticks/2);
  const eased=t<ramp?t*t/(2*ramp):t>ticks-ramp?ticks-ramp-(ticks-t)**2/(2*ramp):t-ramp/2;
  const progress=eased/(ticks-ramp), strides=Math.max(1,Math.round(length/(.30*stride)));
  return {distance:length*progress,frame:Math.floor(progress*strides*8)%8};
}

export function walkSegment(from:Point,to:Point){
  const line=new T.LineCurve3(from,to);
  line.arcLengthDivisions=1;
  return line;
}

export function streetNetwork(fronts:ShopFront[],walkways:Point[][]) {
  const graph=new Map<Point,Set<Point>>();
  function join(a:Point,b:Point){
    if(a===b)return;
    if(!graph.has(a))graph.set(a,new Set());
    graph.get(a)!.add(b);
  }
  for(const line of [...walkways,...fronts.map(f=>[f.target,f.origin])]){
    for(let i=1;i<line.length;i++){
      join(line[i-1]!,line[i]!);join(line[i]!,line[i-1]!);
    }
  }
  const cache=new Map<Point,{distance:Map<Point,number>;previous:Map<Point,Point>}>();
  function pathsFrom(start:Point){
    const known=cache.get(start);
    if(known)return known;
    const distance=new Map([[start,0]]),previous=new Map<Point,Point>();
    const queue=[start];
    while(queue.length){
      queue.sort((a,b)=>distance.get(b)!-distance.get(a)!);
      const here=queue.pop()!;
      for(const next of graph.get(here)??[]){
        const cost=distance.get(here)!+here.distanceTo(next);
        if(cost>=(distance.get(next)??Infinity))continue;
        distance.set(next,cost);previous.set(next,here);
        if(!queue.includes(next))queue.push(next);
      }
    }
    const paths={distance,previous};
    cache.set(start,paths);
    return paths;
  }
  const paths=new Map<Point,Map<Point,T.CurvePath<Point>>>();
  function between(from:Point,to:Point){
    const known=paths.get(from)?.get(to);
    if(known)return known;
    const {previous}=pathsFrom(from),points=[to];
    let point=to;
    while(point!==from){
      const before=previous.get(point);
      if(!before)return;
      points.push(before);point=before;
    }
    const path=new T.CurvePath<Point>();
    for(let j=points.length-1;j>0;j--){
      const a=points[j]!,b=points[j-1]!;
      if(a.distanceToSquared(b)>1e-10)path.add(walkSegment(a,b));
    }
    const destinations=paths.get(from)??new Map<Point,T.CurvePath<Point>>();
    destinations.set(to,path);paths.set(from,destinations);
    return path;
  }
  return {pathsFrom,between};
}

export function shopperRounds(market:ShopFront,fronts:ShopFront[],walkways:Point[][],weekday:number,life:ResidentLife=tomas,network=streetNetwork(fronts,walkways)) {
  const {distance}=network.pathsFrom(market.origin);
  const neighbors=fronts.filter(f=>f.site.bank===market.site.bank && !f.site.quiet &&
    Math.floor(f.site.x/1800)===Math.floor(market.site.x/1800) && distance.has(f.origin))
    .sort((a,b)=>distance.get(a.origin)!-distance.get(b.origin)!);
  const anchorIsHome=siteDistrict(market.site.kind)==='residential';
  const visits:Visit[]=[{place:anchorIsHome?'home':market.site.kind,point:market.origin,activity:life.anchor,site:market.site}];
  const destinations=[...life.destinations];
  if(weekday%2===0)destinations.push(...destinations.splice(1).reverse());
  function addFront(front:ShopFront,activity:Errand,place:string=front.site.kind,memory?:string){
    visits.push({place,point:front.origin,activity,site:front.site,memory});
  }
  for(const destination of destinations){
    const front=neighbors.find(f=>destination.kinds.includes(f.site.kind) && !visits.some(v=>v.point===f.origin));
    if(front)addFront(front,destination.errand,front.site.kind,destination.memory);
  }
  if(!life.tomas && visits.length===1){
    const neighbor=neighbors.find(f=>f!==market && siteDistrict(f.site.kind)!=='residential');
    if(neighbor)addFront(neighbor,{task:'Catching up with a neighbor',journey:'Calling at '+siteName(neighbor.site.kind).replace(/^The /,'the '),gesture:'greet'});
  }
  if(!anchorIsHome){
    const front=neighbors.find(f=>siteDistrict(f.site.kind)==='residential' && !visits.some(v=>v.point===f.origin));
    if(front)addFront(front,life.atHome,'home');
  }
  if(visits.length===1){
    const line=walkways.find(path=>path.includes(market.target));
    if(!line?.length)return;
    const corner=line.reduce((best,p)=>Math.abs(p.distanceTo(market.target)-2)<Math.abs(best.distanceTo(market.target)-2)?p:best);
    visits.push({place:'corner',point:corner,activity:life.corner});
  }
  const home=visits.find(v=>v.place==='home')??(!life.tomas?visits[0]:undefined);
  if(home){visits.splice(visits.indexOf(home),1);visits.unshift(home);}
  const strideScale=life.stride??1;
  const legs:Leg[]=[];
  let period=0;
  for(const [i,from] of visits.entries()){
    const visit=visits[(i+1)%visits.length]!;
    const path=network.between(from.point,visit.point);
    if(!path)continue;
    const length=path.getLength();
    if(!length)continue;
    const walk=walkingTicks(length,strideScale),wait=visit.place==='home'?112:64;
    const ticks=walk+wait+turnTicks;
    legs.push({path,walk,wait,ticks,visit});period+=ticks;
  }
  if(!period)return;
  function sample(seconds:number){
    let tick=Math.floor(seconds*8)%period,leg=legs[0]!;
    for(const candidate of legs){leg=candidate;if(tick<leg.ticks)break;tick-=leg.ticks;}
    const errand=leg.visit.activity,idle=tick-leg.walk,turning=idle>=leg.wait;
    const stride=walkingPose(tick,leg.path.getLength(),strideScale);
    const gesture=idle>=0&&!turning?errand.gesture:undefined;
    return {path:leg.path,task:idle<0?errand.journey:errand.task,
      motion:{distance:stride.distance,direction:1,turning,frame:turning?idle-leg.wait:gesture?10:stride.frame,
        gesture,beat:idle,strength:gesture?Math.min(1,idle/5,(leg.wait-1-idle)/5):0}};
  }
  function sampleDay(seconds:number){
    const dayTime=(seconds-life.shift*3600+86400)%86400;
    const morning=dayTime>=7*3600 && dayTime<12*3600;
    const afternoon=dayTime>=14*3600 && dayTime<19*3600;
    const windowStart=(morning?7:14)*3600;
    const windowLength=5*3600;
    const duration=period/8;
    if((morning||afternoon) && dayTime-windowStart<Math.floor(windowLength/duration)*duration)
      return {...sample(dayTime-windowStart),indoors:false,location:undefined};
    const resting=sample(0);
    const night=dayTime>=21*3600 || dayTime<6*3600;
    const task=night?'Home for the night':dayTime<7*3600?'Putting the kettle on':
      dayTime<14*3600?life.lunch:'Home for supper';
    return {...resting,indoors:!!home,location:home?.site,task:home?task:life.corner.task,
      motion:{...resting.motion,frame:10,gesture:'read' as const,beat:Math.floor(seconds*8)%64,strength:1}};
  }
  return {visits,period,sample,sampleDay};
}
