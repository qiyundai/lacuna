import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bodyBuilds } from '../packages/frontend/src/lib/town/resident-builds.ts';
import { capacities, citizenLife, emptyCensus, housedResidents, settleCity, validCensus } from '../packages/frontend/src/lib/town/citizens.ts';
import { paintedCoast } from '../packages/frontend/src/lib/town/painted-coast.ts';
import { Vector3 } from 'three';
import { shopperRounds } from '../packages/frontend/src/lib/town/shopper-rounds.ts';
import { frontage } from '../packages/frontend/src/lib/town/architecture-catalog.ts';
import { lifeStories } from '../packages/frontend/src/lib/town/life-stories.ts';
import { forgetAddress } from '../packages/shared/city-address.ts';
const day=86400;
const pages=Array.from({length:100},(_,i)=>({id:(i+31).toString(16).padStart(32,'0'),riverEdition:4,created_at:100+i*day}));
test('every occupied type has capacity and each new room contributes one place',()=>{
  assert.deepEqual(Object.keys(capacities).sort(),[...frontage].sort());
  const coast=paintedCoast(pages);
  const census=settleCity(pages,[],emptyCensus(),100);
  assert.equal(census.people.length,coast.sites.reduce((n,s)=>n+capacities[s.kind],0)+pages.length-coast.sites.length);
  assert.ok(census.people.length>200);
  assert.equal(census.people[0].arrival,700);
  assert.equal(new Set(census.people.slice(0,lifeStories.length).map(p=>p.family)).size,lifeStories.length);
  assert.equal(new Set(census.people.slice(0,lifeStories.length).map(p=>citizenLife(p).model)).size,lifeStories.length);
  assert.equal(new Set(census.people.map(p=>p.name)).size,census.people.length);
  assert.equal(new Set(census.people.map(p=>p.slot)).size,census.people.length);
  assert.deepEqual(settleCity(pages,[],census,101),census);
  assert.ok(validCensus(census));
  assert.equal(housedResidents(census,coast,pages).length,census.people.length);
});
test('old towns preserve pilot arrivals, introduce at most four neighbors, and advance once per absence',()=>{
  const now=600*day;
  const original=settleCity(pages,[],undefined,now);
  assert.equal(original.people.filter(p=>p.arrival<=now).length,4);
  assert.ok(original.people.some(p=>p.id===pages[0].id && p.arrival===700));
  const month=settleCity(pages,[],original,now+30*day);
  assert.ok(month.people.every(p=>p.chapters.length<=1));
  assert.deepEqual(settleCity(pages,[],month,now+30*day),month);
  let later=month;
  for(let i=1;i<=2;i++)later=settleCity(pages,[],later,now+(30+5*i)*day);
  const complete=later.people.filter(p=>p.chapters.length===3);
  assert.equal(new Set(complete.map(p=>p.family)).size,lifeStories.length);
  assert.ok(complete.some(p=>p.chapters[2]===2) && complete.some(p=>p.chapters[2]===3));
  for(const p of complete){
    const life=citizenLife(p);
    assert.equal(life.notes.length,7);
    assert.ok(life.paragraphs.some(t=>t.includes(p.friend)));
    assert.equal(p.places.length,3);
  }
});
test('forgetting makes established neighbors move or wait, preserving life history',()=>{
  const subset=pages.slice(0,3);
  const now=80*day;
  const original=settleCity(subset,[],emptyCensus(),now);
  const address=forgetAddress(subset,[],0);
  const remaining=subset.slice(1);
  const changed=settleCity(remaining,[address],original,now);
  for(const person of original.people){
    const found=changed.people.find(p=>p.id===person.id);
    assert.ok(found);
    assert.equal(found.name,person.name);
    assert.equal(found.build,person.build);
    assert.deepEqual(found.chapters,person.chapters);
  }
  assert.ok(changed.people.some(p=>p.slot===null));
  const more=settleCity([...remaining,...pages.slice(3,20)],[address],changed,now+1);
  assert.ok(changed.people.filter(p=>p.slot===null).every(p=>more.people.find(q=>p.id===q.id).slot));
  assert.deepEqual(settleCity([],[],more,now),emptyCensus());
});
test('each family has a local errand, a reachable specialist and a small-town routine',()=>{
  const line=[0,1,2].map(n=>new Vector3(n,0,0));
  const frontageAt=(kind,i,point)=>({site:{id:'place'+i,kind,x:610,bank:0,lane:0},target:point,origin:point.clone().add(new Vector3(0,0,.3))});
  for(const [family,story] of lifeStories.entries()){
    const person={id:'neighbor',name:'Test Neighbor',family,friend:'Lou',origin:'houses',chapters:[]};
    const home=frontageAt('houses',0,line[0]),specialist=frontageAt(story.venues[0],1,line[1]);
    const away=frontageAt(story.venues[0],2,new Vector3(55,0,5));
    const life=citizenLife(person,home.site);
    const rounds=shopperRounds(home,[home,specialist,away],[line],3,life);
    assert.ok(rounds.visits.some(v=>v.site===specialist.site && v.activity.task===story.errand));
    assert.ok(rounds.visits.every(v=>v.site!==away.site));
    assert.ok(rounds.sampleDay(23*3600).indoors);
    const sparse=shopperRounds(home,[home,away],[line],3,life);
    assert.deepEqual(sparse.visits.map(v=>v.place),['home','corner']);
    const progressed=citizenLife({...person,chapters:[0]},home.site);
    assert.notEqual(progressed.anchor.task,life.anchor.task);
  }
});
test('each authored family ships a skinned walking and turning model, keepsake and notebook',async()=>{
  for(const story of lifeStories){
    assert.equal(new Set(story.notes).size,7);assert.equal(story.chapters.length,4);
    const file=await readFile(new URL('../packages/frontend/static/city/residents/'+story.model,import.meta.url));
    const model=JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12)));
    assert.ok(model.skins.length && model.nodes.some(n=>n.name==='Keepsake tag'));
    assert.deepEqual(model.animations.map(a=>a.name).sort(),['Market turnaround','Market walk']);
    for(const build of [undefined,...bodyBuilds]){
      const life=citizenLife({id:'gardener',name:'Remy',family:lifeStories.indexOf(story),build,chapters:[],friend:'Lou',origin:'houses'});
      assert.equal(life.model,story.model);
      assert.equal(life.stride,story.stride);
    }
  }
});
