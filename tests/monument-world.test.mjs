import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { paintedCoast } from '../packages/frontend/src/lib/town/painted-coast.ts';
import { reserveMonument, reservation } from '../packages/frontend/src/lib/town/monument-placement.ts';
import { cityMonuments } from '../packages/frontend/src/lib/town/monument-models.ts';
import { fadingLightSlots } from '../packages/frontend/src/lib/town/fading-light-slots.ts';
import { windowShafts } from '../packages/frontend/src/lib/town/room-light.ts';
import { lightAt } from '../packages/frontend/src/lib/town/city-clock.ts';
import { monumentLightPool } from '../packages/frontend/src/lib/town/monument-light.ts';
import { landHeight, bankEdge } from '../packages/frontend/src/lib/town/valley-river.ts';
import { sitePoint } from '../packages/frontend/src/lib/town/harbor-workshop.ts';
import { forgetPageAt } from '../packages/shared/city-address.ts';
import { exampleJournal } from '../packages/frontend/src/lib/town/example-journal.ts';
import { monuments, writingWeeks } from '../packages/shared/monuments.ts';

test('the playable example reaches all monument milestones at an every-other-day writing cadence',()=>{
  const pages=exampleJournal(),coast=paintedCoast(pages);
  assert.equal(pages.length,91);assert.equal(writingWeeks(pages),26);
  assert.equal(new Set(pages.map(p=>p.id)).size,91);assert.equal(new Set(pages.map(p=>p.body)).size,91);
  assert.ok(pages.slice(1).every((p,i)=>p.created_at-pages[i].created_at===2*86400));
  assert.deepEqual(coast.monumentPlots.map(p=>p.id),monuments.map(m=>m.id));
  assert.deepEqual(exampleJournal(),pages);
});

const journal=(world,n,edition=5)=>Array.from({length:n},(_,i)=>({id:world+'-'+i,riverEdition:edition,created_at:1609459200+i*604800}));

test('each writing milestone claims a stable clear site in its own journal',()=>{
  const layouts=new Set();
  for(const world of ['ash','shore','moss','ivy','pine','reed','oak','pear']){
    const entries=journal(world,100),coast=paintedCoast(entries),plots=coast.monumentPlots;
    assert.deepEqual(plots.map(p=>p.id),monuments.map(m=>m.id));
    for(const [i,{weeks}] of monuments.entries()){
      assert.deepEqual(paintedCoast(entries.slice(0,weeks)).monumentPlots,plots.slice(0,i+1));
      const p=plots[i],occupied=reservation(p);
      for(const site of coast.sites){const q=sitePoint(site);
        assert.ok(occupied.every(r=>Math.abs(q.x-r.x)>r.along || Math.abs(q.z-r.z)>r.across),world+'/'+p.id+'/'+site.id);
      }
      if(p.lots.length===2){assert.deepEqual(p.lots.map(l=>l.bank),[0,1]);assert.ok(p.lots[0].z<p.lots[1].z);}
      if(p.id==='tide-organ'){const l=p.lots[0];assert.ok(Math.abs(l.z-bankEdge(l.x,l.bank))<6);}
    }
    const book={entries:[...entries]};forgetPageAt(book,7);
    assert.deepEqual(paintedCoast(book.entries,book.forgotten).monumentPlots,plots);
    layouts.add(plots.map(p=>Math.round(p.lots[0].x)).join('/'));
    const anchor={...coast.sites[2],x:12.5*3500+900};
    for(const {id} of monuments)assert.ok(Math.abs(reserveMonument(id,world,'remote site',anchor,[anchor],[]).lots[0].x-3500)<140);
  }
  assert.equal(layouts.size,8);
});

test('opening an established city preserves historic parcels before reserving future growth',()=>{
  const old=journal('legacy',45,3),snapshot=paintedCoast(old);
  const sameWeek=paintedCoast(old.map((p,i)=>({...p,created_at:1609459200+i})));
  assert.deepEqual(snapshot.sites,sameWeek.sites);
  const next=journal('later',60).map(p=>({...p,created_at:p.created_at+45*604800}));
  const expanded=paintedCoast([...old,...next]);
  assert.deepEqual(expanded.monumentPlots,snapshot.monumentPlots);
  assert.deepEqual(expanded.sites.slice(0,snapshot.sites.length).map(s=>[s.id,s.x,s.lane,s.bank]),snapshot.sites.map(s=>[s.id,s.x,s.lane,s.bank]));
});

test('light slots retain close-ranked fixtures and turn dark before handing off the slot',()=>{
  const fades=fadingLightSlots(1),slot=fades.slots[0];
  const lamp=x=>({address:1,center:new T.Vector3(x,0,0),normal:new T.Vector3(0,0,1),threshold:0});
  const a=lamp(1),b=lamp(2),choice=(source,score)=>({source,score,strength:1});
  fades.select([choice(a,10),choice(b,11)]);fades.advance(0);
  fades.advance(.325);assert.equal(slot.gain,.5);
  fades.advance(.325);assert.equal(slot.gain,1);
  fades.select([choice(b,9),choice(lamp(1),10)]);assert.equal(fades.advance(.1),false);
  assert.equal(slot.source.center.x,1);assert.equal(slot.gain,1);
  fades.select([choice(b,6),choice(a,10)]);fades.advance(.225);
  assert.equal(slot.source.center.x,1);assert.equal(slot.gain,.5);
  fades.select([choice(a,1),choice(b,8)]);fades.advance(.1);assert.ok(slot.gain>.5 && slot.gain<1);
  fades.select([choice(b,1)]);fades.advance(.45);
  assert.equal(slot.source,b);assert.equal(slot.gain,0);fades.advance(.325);assert.equal(slot.gain,.5);
  fades.select([]);fades.advance(.45);assert.equal(slot.source,undefined);assert.equal(slot.gain,0);
});

test('a shaft eases across its range cutoff while the world clock is stationary',()=>{
  const camera=new T.PerspectiveCamera(55,1,.1,600);
  const shafts=windowShafts(new T.DepthTexture(4,4),camera,2);shafts.screen.set(400,300);
  const night=lightAt(22),color=new T.Color(),gains=[];
  const source={address:1,workplace:false,threshold:0,center:new T.Vector3(),normal:new T.Vector3(0,1,0),fixture:{reach:7,width:3}};
  const renderer={autoClear:true,render(scene){const mesh=scene.children[0];assert.equal(mesh.count,1);mesh.getColorAt(0,color);gains.push(color.r);}};
  function frame(z,dt){camera.position.z=z;camera.updateMatrixWorld();const before=gains.length;
    const changing=shafts.render(renderer,[source],night,0,dt);
    if(before===gains.length)gains.push(0);
    return changing;
  }
  try{
    frame(185,0);frame(185,.325);assert.equal(frame(185,.325),false);
    assert.ok(gains[1]>0 && gains[1]<gains[2]);
    assert.equal(frame(205,.225),true);assert.ok(gains[3]>0 && gains[3]<gains[2]);
    assert.equal(frame(205,.225),false);assert.equal(gains[4],0);
  }finally{shafts.dispose();}
});

test('carriers traverse both cables and all monuments supply clock-controlled light',()=>{
  const tree=new T.Group(),leaf=new T.BoxGeometry();
  leaf.setAttribute('leafMask',new T.Float32BufferAttribute(Array(leaf.getAttribute('position').count).fill(1),1));
  const foliage=new T.MeshStandardMaterial();tree.add(new T.Mesh(leaf,foliage));
  const wind={value:0},city=cityMonuments({treeModels:[tree],breezeTime:wind,clockHour:{value:12}},landHeight);
  const plots=paintedCoast(journal('lighting',30)).monumentPlots;
  const scene=new T.Scene(),pool=monumentLightPool(scene,4),camera=new T.PerspectiveCamera(60,1,.1,700);
  try{
    assert.equal(city.update(plots),true);assert.equal(city.update(structuredClone(plots)),false);
    for(const {id} of monuments){
      const model=city.view(id);assert.ok(model.sources.length>0,id);
      const s=model.sources[0];camera.position.copy(s.center).add(new T.Vector3(0,5,20));camera.lookAt(s.center);camera.updateMatrixWorld();
      for(let i=0;i<16;i++)pool.update(model.sources,camera,.8,.1);
      assert.ok(scene.children.some(light=>light.intensity>0),id);
      pool.update(model.sources,camera,0,.1);assert.ok(scene.children.every(light=>light.intensity===0));
    }
    const carriers=city.view('post-office').group.children.filter(c=>c.name==='Mail carrier');
    assert.equal(carriers.length,4);city.tick(1,0);const a=carriers.map(c=>c.position.clone());
    city.tick(8,1);assert.ok(carriers.every((c,i)=>c.position.distanceTo(a[i])>1));
    const held=carriers.map(c=>c.position.clone());city.tick(8,1);assert.deepEqual(carriers.map(c=>c.position),held);
    city.update([]);assert.equal(city.sources.length,0);assert.equal(city.root.children.length,0);
  }finally{pool.dispose();city.dispose();leaf.dispose();foliage.dispose();}
});
