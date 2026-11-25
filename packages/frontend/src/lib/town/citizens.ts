import { bodyBuilds, type BodyBuild } from './resident-builds.js';
import { lifeStories } from './life-stories.js';
import { siteDistrict, siteName, type Architecture } from './architecture-catalog.js';
import { hashPage, type CityPage } from './city-growth.js';
import { paintedCoast, type Coast, type Site } from './painted-coast.js';
import { residentHomes, type ResidentHome, type ResidentLife } from './resident-lives.js';
import type { ForgottenAddress } from '../../../../shared/city-address.js';

export const capacities = {
  houses:4, steps:2, terraces:8, crescent:8, apartments:8, market:4, warehouse:4, crane:1,
  pines:1, glasshouse:2, station:4, civic:4, belfry:1, towers:8, arches:1, wharf:4, beacon:1,
  bakery:2, tearoom:2, cottages:2, pottery:2, bindery:2, cooperage:4, atelier:4, sailLoft:4,
  postOffice:4, boathouse:2, orangery:2, clockmaker:2, library:4, bathhouse:4, musicHall:4, observatory:2
} satisfies Record<Architecture,number>;

export type Citizen = {
  id:string; name:string; family:number; build?:BodyBuild; slot:string|null; arrival:number; next:number;
  chapters:number[]; places?:Architecture[]; neighbor?:string; friend:string; origin:Architecture;
};
export type Census = {version:1; serial:number; people:Citizen[]};
export const emptyCensus=():Census=>({version:1,serial:0,people:[]});
const hour=3600, day=24*hour;
const firstNames='Ada Iona Jun Luz Nico Mara Idris Esme Oren Ravi Alba Kit Inés Remy Pia Ellis Ren Noor Leila Finn Etta Gil'.split(' ');
const surnames='Alder Costa Bell Reed Mori Linden Silva Chen Perry Dale Navarro Green Hart Shaw West Finch Sato Rios Park Cole'.split(' ');
const pick=(id:string,key:string,size:number)=>hashPage(id+'/'+key)%size;
const tint=[0xffdbac,0xb9d8ff,0xe9bfe0,0xb1d299,0xffb5a2,0xd5c0ff];
const relations=['an old school friend','a cousin','a former neighbor','a childhood pen pal'];

function places(coast:Coast,pages:readonly CityPage[]){
  const slots=new Map<string,{site:Site; founded:number; index:number}>();
  const occupied=new Set<Site>();
  const times=new Map(pages.map(page=>[page.id,page.created_at]));
  for(const [pageId,site] of coast.addresses){
    const founded=times.get(pageId);
    if(founded===undefined || site.quiet)continue;
    const first=!occupied.has(site);
    occupied.add(site);
    for(let i=0;i<(first?capacities[site.kind]:1);i++){
      slots.set(first?site.id+'/'+i:'room/'+pageId,{site,founded,index:first?i:0});
    }
  }
  return slots;
}

export function settleCity(pages:readonly CityPage[],forgotten:readonly ForgottenAddress[],previous:Census|undefined,now:number):Census{
  if(!pages.length)return emptyCensus();
  const coast=paintedCoast(pages,forgotten);
  const slots=places(coast,pages);
  const state=previous?structuredClone(previous):emptyCensus();
  const established=state.people.filter(p=>p.arrival<=now);
  const reserved=new Set<string>();
  const unplaced:Citizen[]=[];
  for(const p of established){
    if(p.slot && slots.has(p.slot) && !reserved.has(p.slot))reserved.add(p.slot);
    else unplaced.push(p);
  }
  const free=[...slots.keys()].filter(k=>!reserved.has(k));
  for(const p of unplaced){
    p.slot=free.shift()??null;
    if(p.slot)reserved.add(p.slot);
  }
  state.people=state.people.filter(p=>{
    if(p.arrival<=now)return true;
    if(!p.slot || !slots.has(p.slot) || reserved.has(p.slot))return false;
    reserved.add(p.slot);
    return true;
  });
  const counts=lifeStories.map(()=>0);
  const builds=lifeStories.map(()=>bodyBuilds.map(()=>0));
  const townBuilds=bodyBuilds.map(()=>0);
  function chooseBuild(id:string,family:number){
    const counts=builds[family]!;
    const fewest=Math.min(...counts);
    const available=bodyBuilds.filter((_,i)=>counts[i]===fewest);
    const minTown=Math.min(...available.map(b=>townBuilds[bodyBuilds.indexOf(b)]!));
    const options=available.filter(b=>townBuilds[bodyBuilds.indexOf(b)]===minTown);
    return options[pick(id,'physique',options.length)]!;
  }
  function countBuild(family:number,shape:BodyBuild){
    const i=bodyBuilds.indexOf(shape);
    builds[family]![i]!++;townBuilds[i]!++;
  }
  for(const p of state.people)if(p.build)countBuild(p.family,p.build);
  for(const p of state.people)if(!p.build){p.build=chooseBuild(p.id,p.family);countBuild(p.family,p.build);}
  const names=new Set(state.people.map(p=>p.name));
  for(const p of state.people)counts[p.family]!++;
  const migration=!previous;
  const pilots=migration?residentHomes(coast,pages):[];
  let establishedCount=pilots.filter(h=>h.arrival<=now).length;
  const lastAt=new Map<string,number>();
  for(const p of state.people){
    const slot=p.slot && slots.get(p.slot);
    if(slot)lastAt.set(slot.site.id,Math.max(lastAt.get(slot.site.id)??0,p.arrival));
  }
  for(const [key,slot] of slots){
    if(reserved.has(key))continue;
    const {site,index,founded}=slot;
    const pilot=index===0 && !key.startsWith('room/')?pilots.find(h=>h.site.id===site.id):undefined;
    const id=pilot?.resident??site.id+'-'+(++state.serial).toString(36);
    const floor=Math.min(...counts);
    const options=lifeStories.map((s,i)=>({s,i})).filter(o=>counts[o.i]===floor);
    const matches=options.filter(o=>o.s.district===siteDistrict(site.kind));
    const pool=matches.length?matches:options;
    const pilotFamily=pilot?lifeStories.findIndex(s=>s.title===pilot.life.title):-1;
    const family=pilotFamily>=0?pilotFamily:pool[pick(id,'project',pool.length)]!.i;
    const build=chooseBuild(id,family);
    countBuild(family,build);
    counts[family]!++;
    let name=pilot?.life.name??firstNames[pick(id,'first',firstNames.length)]+' '+surnames[pick(id,'last',surnames.length)];
    for(let n=1;names.has(name);n++){
      const first=firstNames[(pick(id,'first',firstNames.length)+Math.floor(n/surnames.length))%firstNames.length];
      const last=(pick(id,'last',surnames.length)+n)%surnames.length;
      const cycle=Math.floor(n/(surnames.length*firstNames.length));
      const second=(last+1+(cycle-1)%(surnames.length-1))%surnames.length;
      name=first+' '+surnames[last]+(cycle?'-'+surnames[second]:'')+(cycle>=surnames.length?' '+(1+Math.floor(cycle/surnames.length)):'');
    }
    names.add(name);
    const last=lastAt.get(site.id);
    const wait=last===undefined?(state.people.length===0?600:(6+pick(id,'arrival',19))*hour):(24+pick(id,'interval',25))*hour;
    let arrival=pilot?.arrival??Math.max(last??0,founded,migration?now:0)+wait;
    if(migration && !pilot && establishedCount<4 && founded+wait<=now){
      arrival=now;establishedCount++;
    }
    lastAt.set(site.id,Math.max(last??0,arrival));
    state.people.push({id,name,family,build,slot:key,arrival,next:Math.max(arrival,migration?now:0)+day,
      chapters:[],friend:pick(id,'correspondent',3)===0?firstNames[pick(id,'signature',firstNames.length)]!:lifeStories[family]!.correspondent,origin:site.kind});
  }
  const localVenues=new Map<string,Site[]>();
  const streetOf=(site:Site)=>[site.bank,Math.floor(site.x/1800),site.kind==='wharf'?3:site.lane].join('/');
  for(const site of coast.sites)if(!site.quiet){
    const street=streetOf(site),neighbors=localVenues.get(street)??[];
    neighbors.push(site);localVenues.set(street,neighbors);
  }
  const households=new Map<string,Citizen[]>();
  for(const p of state.people){
    const place=p.slot && slots.get(p.slot);
    if(p.arrival>now || !place)continue;
    const group=households.get(place.site.id)??[];
    group.push(p);households.set(place.site.id,group);
  }
  for(const p of state.people){
    const place=p.slot && slots.get(p.slot);
    if(!place || p.arrival>now)continue;
    const neighbor=households.get(place.site.id)?.find(other=>other.id!==p.id);
    if(!p.neighbor && neighbor)p.neighbor=neighbor.name;
    if(p.next>now || p.chapters.length>=3)continue;
    const next=p.chapters.length;
    const venues=lifeStories[p.family]!.venues;
    const nearby=localVenues.get(streetOf(place.site))?.find(s=>venues.includes(s.kind));
    p.chapters.push(next===2?(nearby?2:3):next);
    (p.places??=[]).push(nearby?.kind??place.site.kind);
    p.next=now+(2+pick(p.id,'chapter'+next,3))*day;
  }
  return state;
}

const stageTasks=[
  [
    "Listening for ripe seed heads",
    "Folding the first envelopes",
    "Collecting drawings of last year’s flowers",
    "Handing out birthday seeds"
  ],
  [
    "Listening for the first echo",
    "Walking the map with eyes closed",
    "Correcting the troublesome turning",
    "Sharing the listening map"
  ],
  [
    "Sorting the fittings",
    "Tracing a missing hinge",
    "Trying the repaired latch",
    "Lending a tin of spare parts"
  ],
  [
    "Counting the chairs",
    "Writing place cards",
    "Testing the bread pudding",
    "Collecting recipes after supper"
  ],
  [
    "Sorting the photographs",
    "Pencilling a name beneath the dog",
    "Checking the family’s address",
    "Sharing copies of the named prints"
  ],
  [
    "Trimming the wick",
    "Tracing the crescent of light",
    "Adjusting the foil collar",
    "Lighting the finished lamp"
  ],
  [
    "Weighing the two spars",
    "Tying a second tail",
    "Timing the first steady flight",
    "Showing someone how to launch"
  ],
  [
    "Listening for the eighth note",
    "Filing a new clapper",
    "Practising the last two bars",
    "Playing the complete lullaby"
  ],
  [
    "Threading the needle",
    "Matching the red scrap",
    "Stitching names along the seams",
    "Showing the names inside the cape"
  ],
  [
    "Checking the water mark",
    "Scribing a brass scale",
    "Comparing the last three readings",
    "Setting the tide gauge"
  ],
  [
    "Checking the toy keel",
    "Moving the ballast",
    "Drying the first sail",
    "Launching the wooden boat"
  ],
  [
    "Setting the dancing letter",
    "Pulling the first proof",
    "Cutting the last letter",
    "Inking the full alphabet"
  ]
];

export function citizenLife(p:Citizen,site?:Site):ResidentLife{
  const story=lifeStories[p.family]!,stage=p.chapters.length;
  const work=stageTasks[p.family]![stage]!;
  const friend=p.friend;
  const keepsake=story.keepsake;
  const gesture=p.family%3===0?'bag':p.family%3===1?'read':'greet';
  const finishes=['wrapped in a faded tea towel','marked with two small initials','patched with a stripe of blue','tied with red cotton'];
  const personal=finishes[pick(p.id,'mark',finishes.length)];
  return {name:p.name,title:story.title,heading:'From the pocket notebook',notes:story.notes,tomas:false,
    family:story.key,build:p.build??bodyBuilds[pick(p.id,'physique',bodyBuilds.length)],chapter:stage,paragraphs:[
      pick(p.id,'firstMemory',2)?p.name+' '+story.past:story.recollection,friend+', '+relations[pick(p.id,'friend',relations.length)]+', has kept in touch ever since. '+story.promise.replaceAll(story.correspondent,friend),
      story.detail,'The '+keepsake+', '+personal+', usually goes along to '+siteName(p.origin).replace(/^The /,'the ')+'.',
      ...(p.neighbor?['The neighbor who asks how it is going, even on the slow days, is '+p.neighbor+'.']:[]),
      ...p.chapters.map((i,step)=>(p.places?.[step]?siteName(p.places[step]!)+' · ':'')+story.chapters[i]!.replaceAll(story.correspondent,friend))],
    anchor:{task:work,journey:'On the way to '+siteName(site?.kind??p.origin).replace(/^The /,'the '),gesture},
    destinations:[{kinds:story.venues,errand:{task:stage>0?work:story.errand,journey:'Carrying the '+keepsake,gesture}},
      ...story.calls.map((call,i)=>({kinds:call.venues,errand:{task:call.task,journey:'Taking the '+keepsake+' on a neighborhood call',gesture:i===0?'bag' as const:'greet' as const}}))],
    atHome:{task:'Putting away the '+keepsake,journey:'Heading home',gesture:'bag'},
    corner:{task:work,journey:'Finding a quiet spot',gesture},lunch:'At home for lunch',
    shift:([-.75,-.5,0,.5,.75][pick(p.id,'hours',5)]!+pick(p.id,'minutes',19)/60),tint:tint[pick(p.id,'sweater',tint.length)]!};
}

export function housedResidents(census:Census,coast:Coast,pages:readonly CityPage[]):ResidentHome[]{
  const slots=places(coast,pages);
  return census.people.flatMap(p=>{
    const place=p.slot && slots.get(p.slot);
    return place?[{resident:p.id,site:place.site,arrival:p.arrival,life:citizenLife(p,place.site)}]:[];
  });
}

export function validCensus(state:Census){
  return state?.version===1 && Number.isSafeInteger(state.serial) && state.serial>=0 && Array.isArray(state.people)
    && state.people.every(p=>p && typeof p.id==='string' && typeof p.name==='string' && typeof p.friend==='string'
      && Object.hasOwn(capacities,p.origin) && Number.isInteger(p.family) && !!lifeStories[p.family]
      && (p.build===undefined || bodyBuilds.includes(p.build))
      && (p.slot===null || typeof p.slot==='string') && Number.isSafeInteger(p.arrival) && Number.isSafeInteger(p.next)
      && (p.neighbor===undefined || typeof p.neighbor==='string') && (p.places===undefined || (Array.isArray(p.places) && p.places.length<=3 && p.places.every(k=>Object.hasOwn(capacities,k))))
      && Array.isArray(p.chapters) && p.chapters.length<=3 && p.chapters.every((n,i)=>n===i || (i===2 && n===3)))
    && new Set(state.people.map(p=>p.id)).size===state.people.length;
}
