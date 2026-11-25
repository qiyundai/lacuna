import { CatmullRomCurve3, CurvePath, MathUtils, Vector3 } from 'three';
import { hashPage } from './city-growth.js';
import type { Bank } from './painted-coast.js';
import { bankPosition, overlookCrest as crest, valleyOrigin } from './valley-river.js';
import { walkingPose, walkingTicks, walkSegment, turnTicks } from './shopper-rounds.js';

type Ground = (x:number,z:number)=>number;
export function overlookView(){
  return {eye:new Vector3(70,165,493),target:new Vector3(73,132,263)};
}

export function hillTrail(gate:Vector3,bank:Bank,slot:number,ground:Ground){
  const points=[gate];
  const gateGround=ground(valleyOrigin.x+gate.z,valleyOrigin.z-gate.x);
  function append(station:number,across:number){
    const last=points[points.length-1]!;
    const steps=Math.ceil(Math.hypot(station-last.x,across-last.z)/.8);
    for(let i=1;i<=steps;i++){
      const x=MathUtils.lerp(last.x,station,i/steps),z=MathUtils.lerp(last.z,across,i/steps);
      const landing=(gate.y-gateGround)*(1-MathUtils.smoothstep(Math.hypot(x-gate.x,z-gate.z),0,3));
      points.push(new Vector3(x,ground(valleyOrigin.x+z,valleyOrigin.z-x)+landing,z));
    }
  }
  const inland=bank===0?bankPosition(gate.x,0,0)-gate.z:gate.z-bankPosition(gate.x,1,0);
  const foothill=-143;
  for(let station=gate.x-1;station>foothill;station-=2){
    const blend=MathUtils.smoothstep(gate.x-station,0,18);
    append(station,bankPosition(station,bank,MathUtils.lerp(inland,18,blend)));
  }
  append(foothill,bankPosition(foothill,bank,18));
  const start=points.at(-1)!;
  const landmarks=[
    [valleyOrigin.x+start.z,valleyOrigin.z-start.x],
    ...(bank===0?[[15,290],[-15,320],[-40,330]]:[[95,305],[85,325],[75,335],[30,335],[-15,335],[-45,330]]),
    [-65,335],[-80,345],[-100,370],[-120,400],[-120,445],[-100,470],[-90,485],
    [-65,475],[-25,500],[-20,505],[5,490],[25,475],
    [crest.x+slot*1.35,crest.z+4],
    [crest.x+slot*1.35,crest.z+2],[crest.x+slot*1.35,crest.z+(slot===0?0:.34)]
  ];
  const curve=new CatmullRomCurve3(landmarks.map(([x,z])=>new Vector3(x,0,z)),false,'catmullrom',.16);
  for(const p of curve.getSpacedPoints(Math.ceil(curve.getLength()/1.2)).slice(1))append(valleyOrigin.z-p.z,p.x-valleyOrigin.x);
  const path=new CurvePath<Vector3>();
  for(let i=1;i<points.length;i++)path.add(walkSegment(points[i-1]!,points[i]!));
  return path;
}

export type HillPose='standing'|'leaning'|'knees-up'|'legs-out';
type HillGuest={slot:number;meet:number;leave:number};
export type HillExchange={look:number;point:number;nod:number};
export type HillMotion={posture?:HillPose;strength?:number;beat?:number;exchange?:HillExchange};

function exchangeAt(seconds:number,slot:number,party:readonly HillGuest[]):HillExchange|undefined {
  if(party.length<2)return;
  const start=party.at(-1)!.meet+3;
  if(seconds<start || seconds>=party[0]!.leave-2)return;
  const tick=Math.floor((seconds-start)*8),phrase=Math.floor(tick/176),beat=tick%176;
  const speaker=party[phrase%party.length]!,listener=party[(phrase+1)%party.length]!;
  if(slot!==speaker.slot && slot!==listener.slot)return;
  const speaking=slot===speaker.slot,neighbor=speaking?listener:speaker;
  const pulse=(from:number,peak:number,hold:number,end:number)=>
    MathUtils.smootherstep(beat,from,peak)*(1-MathUtils.smootherstep(beat,hold,end));
  const look=speaking?pulse(0,9,23,42):pulse(6,15,35,51);
  return {look:Math.sign(slot-neighbor.slot)*look,point:speaking?pulse(21,33,55,70):0,
    nod:speaking?0:pulse(36,40,42,48)+.65*pulse(49,53,55,62)};
}
export const hillPoses:HillPose[]=['standing','knees-up','leaning','legs-out'];

export function planHillWalk(path:CurvePath<Vector3>,period:number,shift:number,stride:number,session:number,meet:number,stay:number,posture:HillPose,slot=0,party:readonly HillGuest[]=[]){
  const length=path.getLength(),ticks=walkingTicks(length),travel=ticks/8;
  const cycle=period/8,start=(session+shift)*3600,end=start+5*3600;
  const depart=meet-travel,leave=meet+stay,back=leave+travel+turnTicks/8;
  const breakStart=start+Math.floor((depart-start)/cycle)*cycle;
  const resume=start+Math.ceil((back-start)/cycle)*cycle;
  if(breakStart<start+cycle || resume>end-cycle)return;
  return {session,depart,meet,leave,back,breakStart,resume,posture,sample(seconds:number){
    if(seconds<breakStart || seconds>=resume)return;
    const resting=seconds>=meet && seconds<leave,returning=seconds>=leave;
    const atDoor=seconds<depart || seconds>=back;
    const pivot=returning && seconds<leave+turnTicks/8;
    const elapsed=returning?seconds-leave-turnTicks/8:seconds-depart;
    const tick=MathUtils.clamp(Math.floor(elapsed*8),0,ticks);
    const walk=walkingPose(tick,length);
    const walkingFrame=Math.floor(walk.distance/(.30*stride)*8)%8;
    const beat=Math.floor((seconds-meet)*8);
    const strength=resting?MathUtils.smootherstep(Math.min(beat,(leave-seconds)*8),0,14):0;
    const motion:HillMotion & {distance:number;direction:number;turning:boolean;frame:number}={
      distance:resting||pivot?length:returning?length-walk.distance:walk.distance,
      direction:returning&&!pivot?-1:1,turning:pivot,
      frame:pivot?Math.floor((seconds-leave)*8):resting||atDoor?10:walkingFrame,
      posture:resting?posture:undefined,strength,beat:resting?beat:undefined,
      exchange:resting?exchangeAt(seconds,slot,party):undefined
    };
    return {path,indoors:atDoor,location:undefined,motion,task:atDoor?'At home':resting?'Watching the valley from the hill':returning?'Walking home from the overlook':'Walking up to the overlook'};
  }};
}

type Walker={id:string;shift:number;stride:number;period:number;bank:Bank;arrival:number;path:(slot:number)=>CurvePath<Vector3>|undefined};
export function hillVisits(walkers:Walker[],today:Date){
  const date=today.toDateString(),midnight=new Date(today).setHours(0,0,0,0)/1000;
  const visits=new Map<string,NonNullable<ReturnType<typeof planHillWalk>>>();
  for(const session of [7,14]){
    const seed=date+'/overlook/'+session;
    const draw=(key:string)=>hashPage(seed+'/'+key);
    const meet=(session+1.5)*3600+draw('minute')%6900;
    const stay=18*60+draw('linger')%780;
    const size=1+draw('party')%3;
    const candidates=walkers.filter(w=>!visits.has(w.id)).sort((a,b)=>draw(a.id)-draw(b.id)||a.id.localeCompare(b.id));
    if(walkers.length===1 && draw('outing')%3!==0)continue;
    const party:HillGuest[]=[];
    let bank:Bank|undefined;
    for(const walker of candidates){
      if(bank!==undefined && walker.bank!==bank)continue;
      const count=party.length,slot=[0,-1,1][count]!;
      const path=walker.path(slot);
      if(!path)continue;
      const posture=hillPoses[(draw('poses')+count)%hillPoses.length]!;
      const trip=planHillWalk(path,walker.period,walker.shift,walker.stride,session,meet+count*4,stay+count*2,posture,slot,party);
      if(!trip || trip.depart<walker.arrival-midnight)continue;
      visits.set(walker.id,trip);bank=walker.bank;
      party.push({slot,meet:trip.meet,leave:trip.leave});
      if(party.length===size)break;
    }
  }
  return visits;
}
