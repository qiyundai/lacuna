import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { residentMotion } from '../packages/frontend/src/lib/town/harbor-residents.ts';
import { residentHomes } from '../packages/frontend/src/lib/town/resident-lives.ts';
import { shopperRounds } from '../packages/frontend/src/lib/town/shopper-rounds.ts';
import { Vector3 } from 'three';

test('the shopper visits connected front doors, pauses to do errands, and walks home without a jump',()=>{
  const street=[0,1,2,3].map(x=>new Vector3(x,0,0));
  const upper=street.map(p=>new Vector3(p.x,.45,2));
  const front=(kind,target)=>({site:{kind,bank:0,x:600},target,origin:target.clone().add(new Vector3(0,0,.35))});
  const market=front('market',street[0]),bakery=front('bakery',upper[0]),home=front('houses',street[2]);
  const other=front('bindery',new Vector3(6,0,4)),dark=front('wharf',upper[2]);dark.site.quiet=true;
  const route=shopperRounds(market,[market,bakery,home,other,dark],[street,upper,[street[3],upper[3]]],2);
  assert.deepEqual(route.visits.map(v=>v.place),['home','market','bakery']);
  const gestures=new Set();
  let previous=home.origin;
  for(let i=0;i<=route.period;i++){
    const {path,motion}=route.sample(i/8);
    const here=path.getPoint(motion.distance/path.getLength());
    assert.ok(here.distanceTo(previous)<.04001);
    if(motion.gesture){
      gestures.add(motion.gesture);
      assert.ok(route.visits.some(v=>v.point.distanceTo(here)<1e-8));
    }
    previous=here;
  }
  assert.ok(previous.distanceTo(home.origin)<1e-8);
  assert.deepEqual([...gestures].sort(),['bag','greet','read']);
  for(const hour of [3,12.5,21.5]){
    const rest=route.sampleDay(hour*3600);
    assert.ok(rest.indoors);
    assert.ok(rest.path.getPoint(0).distanceTo(home.origin)<1e-8);
  }
  const departure=route.sampleDay(14*3600);
  assert.equal(departure.indoors,false);
  assert.ok(departure.path.getPoint(0).distanceTo(home.origin)<1e-8);
  const sparse=shopperRounds(market,[market],[street],2);
  assert.deepEqual(sparse.visits.map(v=>v.place),['market','corner']);
  assert.equal(sparse.sampleDay(22*3600).indoors,false);
});

test('the shipping shopper includes the skeletal walk and full step-turn used by the city',async()=>{
  const file=await readFile(new URL('../packages/frontend/static/city/residents/market-shopper.glb',import.meta.url));
  const gltf=JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12)));
  const walk=gltf.animations.find(clip=>clip.name==='Market walk');
  const turn=gltf.animations.find(clip=>clip.name==='Market turnaround');
  assert.ok(walk && turn);
  const joints=turn.channels.filter(channel=>channel.target.path==='rotation')
    .map(channel=>gltf.nodes[channel.target.node].name);
  for(const joint of ['Pelvis','Shin.L','Shin.R','Head','Tote'])assert.ok(joints.includes(joint));
  const duration=Math.max(...turn.samplers.map(s=>gltf.accessors[s.input].max[0]));
  const turningTicks=Array.from({length:110},(_,tick)=>residentMotion('shopper',tick/8,2.6))
    .filter(pose=>pose.turning&&pose.direction===1);
  assert.equal(duration,turningTicks.length/8);
});

test('only Tomás at the first occupied market lives in the example harbor',()=>{
  const site=(id,kind,extra={})=>({id,kind,...extra});
  const market=site('market','market'),library=site('library','library',{readableId:'kept-room'});
  const coast={sites:[site('dark','library',{quiet:true}),market,site('market2','market'),library,site('wharf','wharf')]};
  const pages=['dark','market','market2','kept-room','wharf'].map((id,i)=>({id,created_at:i*100}));
  assert.deepEqual(residentHomes(coast,pages,true).map(({life,...home})=>home),[
    {resident:'shopper',site:market,arrival:700}
  ]);
  assert.deepEqual(residentHomes({sites:[library]},pages,true),[]);
  assert.deepEqual(residentHomes({sites:[]},pages),[]);
});

test('personal residents keep their identities as a neighborhood grows and inherit only reachable errands',()=>{
  const address=(id,kind)=>({id,kind,bank:0,lane:0,x:600});
  const a=address('fern','orangery'),b=address('letter','library'),green=address('under-glass','glasshouse');
  const pages=[a,b,green].map((s,i)=>({id:s.id,created_at:100+i}));
  const original=residentHomes({sites:[a,b]},pages);
  const grown=residentHomes({sites:[a,b,green]},[...pages].reverse());
  assert.deepEqual(grown,original);
  assert.equal(new Set(grown.map(r=>r.life.name)).size,2);
  const neighbors=['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','00000000000000000000000000000001'].map((id,i)=>address(id,i?'warehouse':'market'));
  const residents=residentHomes({sites:neighbors},neighbors.map(s=>({id:s.id,created_at:100})));
  assert.equal(new Set(residents.map(r=>r.life.title)).size,2);
  assert.ok(grown.every(r=>!r.life.tomas && r.life.notes.length && r.life.paragraphs.length>1));
  assert.notEqual(residentHomes({sites:[address('different-address','orangery')]},[{id:'different-address',created_at:100}])[0].life.name,grown[0].life.name);
  const line=[0,1,2].map(i=>new Vector3(i,0,0));
  const front=(site,t)=>({site,target:t,origin:t.clone().add(new Vector3(0,0,.5))});
  const source=front(a,line[0]),available=front(green,line[1]),unreachable=front(b,new Vector3(5,0,4));
  const life=grown[0].life;
  const plan=shopperRounds(source,[source,available,unreachable],[line],2,life);
  assert.ok(plan.visits.some(v=>v.site===green));
  assert.ok(plan.visits.every(v=>v.site!==b && !JSON.stringify(v.activity).includes('Nell')));
  assert.equal(plan.visits.find(v=>v.site===a).activity,life.anchor);
});

test('resident poses hold between ticks and the shopper eases into a full turnaround at each end',()=>{
  const length=2.6;
  for(const resident of ['reader','shopper']){
    assert.deepEqual(residentMotion(resident,.02,length),residentMotion(resident,.05,length));
    const samples=Array.from({length:220},(_,i)=>residentMotion(resident,i/8,length));
    assert.ok(samples.every(s=>s.distance>=0&&s.distance<=length));
    const poses=new Set(samples.filter(s=>!s.turning).map(s=>s.frame));
    assert.equal(poses.size,resident==='reader'?16:8);
    if(resident==='reader')assert.ok(samples.every(s=>s.distance===length/2));
    else{
      for(const end of [0,length]){
        const turn=samples.filter(s=>s.turning&&s.distance===end);
        assert.deepEqual(turn.map(s=>s.frame),Array.from({length:20},(_,i)=>i));
      }
      const arrival=samples.findIndex(s=>s.turning);
      assert.ok(samples[1].distance<samples[4].distance-samples[3].distance);
      assert.ok(length-samples[arrival-1].distance<samples[4].distance-samples[3].distance);
      assert.deepEqual(samples[0],samples[2*(arrival+20)]);
    }
  }
});
