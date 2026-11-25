import type { RoomSource } from './room-light.js';

type Candidate={source:RoomSource;score:number;strength:number};
type Slot={source?:RoomSource;key?:string;progress:number;strength:number;gain:number};
const identities=new WeakMap<RoomSource,string>();

function fixtureKey(source:RoomSource){
  let key=identities.get(source);
  if(key===undefined){
    const {center,normal}=source;
    key=[source.address,center.x,center.y,center.z,normal.x,normal.y,normal.z,source.threshold].join('/');
    identities.set(source,key);
  }
  return key;
}

export function fadingLightSlots(capacity:number){
  const slots:Slot[]=Array.from({length:capacity},()=>({progress:0,strength:0,gain:0}));
  let wanted=new Map<string,Candidate>();
  function select(candidates:Candidate[],budget=capacity){
    const ranked=candidates.map(candidate=>{
      const key=fixtureKey(candidate.source);
      return {key,candidate,rank:candidate.score*(wanted.has(key) ? .8 : 1)};
    }).sort((a,b)=>a.rank-b.rank);
    const next=new Map<string,Candidate>();
    for(const {key,candidate} of ranked){
      if(next.size>=budget)break;
      next.set(key,candidate);
    }
    wanted=next;
  }
  function advance(dt:number){
    const occupied=new Set<string>();
    let changing=false;
    for(const slot of slots){
      if(slot.key===undefined)continue;
      if(!wanted.has(slot.key)){
        slot.progress=Math.max(0,slot.progress-dt/.45);
        if(slot.progress===0){slot.key=undefined;slot.source=undefined;slot.gain=0;continue;}
        changing=true;
      }
      occupied.add(slot.key);
    }
    for(const slot of slots){
      if(slot.key===undefined)continue;
      const candidate=wanted.get(slot.key);
      if(candidate){
        slot.source=candidate.source;slot.strength=candidate.strength;
        slot.progress=Math.min(1,slot.progress+dt/.65);
        if(slot.progress<1)changing=true;
      }
      const p=slot.progress;
      slot.gain=slot.strength*p*p*(3-2*p);
    }
    for(const [key,candidate] of wanted){
      if(occupied.has(key))continue;
      if(occupied.size>=wanted.size)break;
      const slot=slots.find(s=>s.key===undefined);
      if(!slot)break;
      slot.key=key;slot.source=candidate.source;slot.strength=candidate.strength;
      occupied.add(key);changing=true;
    }
    return changing;
  }
  return {slots,select,advance};
}
