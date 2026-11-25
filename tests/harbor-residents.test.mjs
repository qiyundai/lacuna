import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { residentMotion } from '../packages/frontend/src/lib/town/harbor-residents.ts';
import { residentHomes } from '../packages/frontend/src/lib/town/resident-lives.ts';
import { shopperRounds } from '../packages/frontend/src/lib/town/shopper-rounds.ts';
import { overlookPose } from '../packages/frontend/src/lib/town/overlook-pose.ts';
import { CurvePath, LineCurve3, Object3D, PerspectiveCamera, PropertyBinding, Vector3 } from 'three';
import { hillTrail, hillVisits, overlookView, planHillWalk } from '../packages/frontend/src/lib/town/overlook-walk.ts';
import { overlookHeight } from '../packages/frontend/src/lib/town/green-corridor.ts';
import { bankPosition, inValley, riverGround, valleyOrigin } from '../packages/frontend/src/lib/town/valley-river.ts';

test('hill parties fit a full round trip between errands and keep their seats across reloads',()=>{
  const trail=new CurvePath();
  trail.add(new LineCurve3(new Vector3(),new Vector3(540,0,0)));
  const date=new Date(2026,10,25),walkers=Array.from({length:12},(_,i)=>({
    id:'resident-'+i,bank:0,arrival:0,shift:(i%3-1)/2,stride:1,period:1800,path:()=>trail
  }));
  const visits=hillVisits(walkers,date);
  assert.deepEqual([...visits.keys()],[...hillVisits(walkers.toReversed(),date).keys()]);
  assert.deepEqual([...new Set([...visits.values()].map(v=>v.session))],[7,14]);
  const poses=new Set();
  for(const [id,trip] of visits){
    const walker=walkers.find(w=>w.id===id),start=(trip.session+walker.shift)*3600;
    const cycle=walker.period/8;
    assert.ok(trip.breakStart>=start+cycle && trip.resume<=start+5*3600-cycle);
    assert.equal((trip.breakStart-start)%cycle,0);
    assert.equal((trip.resume-start)%cycle,0);
    assert.equal(trip.sample(trip.breakStart-.125),undefined);
    assert.equal(trip.sample(trip.depart).motion.distance,0);
    assert.ok(trip.sample(trip.meet-.125).motion.distance>539.9);
    const pause=trip.sample(trip.meet+10);
    assert.equal(pause.motion.distance,540);
    assert.equal(pause.motion.strength,1);
    poses.add(pause.motion.posture);
    assert.ok(trip.sample(trip.leave).motion.turning);
    assert.ok(trip.sample(trip.back-.125).motion.distance<.01);
    assert.equal(trip.sample(trip.resume),undefined);
    for(const hour of [3,12.9,22])assert.equal(trip.sample(hour*3600),undefined);
  }
  assert.ok(poses.size>=3);
  assert.equal(hillVisits(walkers.map(w=>({...w,arrival:new Date(2026,10,25,20).getTime()/1000})),date).size,0);
  assert.equal(planHillWalk(trail,5*3600*8,0,1,7,9*3600,600,'standing'),undefined);
  const visitors=new Set();
  for(let d=1;d<=30;d++)for(const id of hillVisits(walkers,new Date(2026,10,d)).keys())visitors.add(id);
  assert.equal(visitors.size,walkers.length);
});

test('hikers take turns pointing and responding only while their companions are at the crest',()=>{
  const trail=new CurvePath();
  trail.add(new LineCurve3(new Vector3(),new Vector3(540,0,0)));
  const walkers=Array.from({length:8},(_,i)=>({id:String(i),bank:0,arrival:0,shift:0,stride:1,period:1800,path:()=>trail}));
  const trips=[...hillVisits(walkers,new Date(2026,10,25)).values()];
  const group=trips.filter(t=>t.session===7),solo=trips.find(t=>t.session===14);
  assert.equal(group.length,3);
  const start=group.at(-1).meet+3;
  for(const [i,speaker] of group.entries()){
    const listener=group[(i+1)%group.length],time=start+i*22;
    const message=(trip,tick)=>trip.sample(time+tick/8).motion.exchange;
    assert.equal(message(speaker,17).look,-message(listener,17).look);
    assert.equal(message(speaker,40).point,1);
    assert.equal(message(listener,40).nod,1);
    assert.equal(message(group[(i+2)%3],40),undefined);
  }
  assert.equal(group[0].sample(group[0].meet+2).motion.exchange,undefined);
  assert.equal(solo.sample(solo.meet+10).motion.exchange,undefined);
});

test('every resident rig lowers its elbows, gestures with the free arm and releases its walking pose',async()=>{
  const {readdir}=await import('node:fs/promises');
  const dir=new URL('../packages/frontend/static/city/residents/',import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.glb'))){
    const bytes=await readFile(new URL(file,dir));
    const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    const model=new Object3D();
    const nodes=gltf.nodes.map(n=>{
      const o=new Object3D();o.name=PropertyBinding.sanitizeNodeName(n.name??'');
      if(n.translation)o.position.fromArray(n.translation);
      if(n.rotation)o.quaternion.fromArray(n.rotation);
      if(n.scale)o.scale.fromArray(n.scale);
      return o;
    });
    gltf.nodes.forEach((n,i)=>n.children?.forEach(child=>nodes[i].add(nodes[child])));
    for(const i of gltf.scenes[gltf.scene??0].nodes)model.add(nodes[i]);
    const pose=overlookPose(model,0),cuff=model.getObjectByName('CuffR');
    const shoulder=model.getObjectByName('SleeveR'),original=shoulder.quaternion.clone();
    const elbowDirection=()=>cuff.position.clone().normalize().applyQuaternion(shoulder.quaternion);
    pose.apply('standing',1,0);
    assert.ok(elbowDirection().y<-.95,file);
    const head=model.getObjectByName('Head'),gaze=head.quaternion.clone();
    pose.reset();pose.apply('standing',1,20);
    assert.ok(head.quaternion.angleTo(gaze)>.05,file);
    pose.reset();pose.apply('standing',1,20,{point:1,look:0,nod:0});
    assert.ok(elbowDirection().z>.8,file);
    pose.reset();
    assert.ok(shoulder.quaternion.equals(original),file);
  }
});

test('both hill trails stay grounded, face down-valley and frame separate seats on desktop and phone',()=>{
  for(const bank of [0,1]){
    const gate=new Vector3(-70,0,bankPosition(-70,bank,18));
    gate.y=riverGround(valleyOrigin.x+gate.z,valleyOrigin.z-gate.x);
    for(const slot of [-1,0,1]){
      const trail=hillTrail(gate,bank,slot,overlookHeight),length=trail.getLength();
      assert.ok(trail.getPoint(0).distanceTo(gate)<.001);
      for(let step=0;step<=500;step++){
        const p=inValley(trail.getPoint(step/500));
        assert.ok(p.y>.5);
        assert.ok(Math.abs(p.y-overlookHeight(p.x,p.z))<.09);
      }
      const foot=inValley(trail.getPoint(1)),behind=inValley(trail.getPoint(1-.2/length));
      assert.ok(behind.z>foot.z+.16 && Math.abs(foot.x-behind.x)<.02);
      for(const aspect of [390/844,16/9]){
        const camera=new PerspectiveCamera(47,aspect,.3,20000),view=overlookView();
        assert.deepEqual(view.eye.toArray(),[70,165,493]);
        assert.deepEqual(view.target.toArray(),[73,132,263]);
        camera.position.copy(view.eye);camera.lookAt(view.target);camera.updateMatrixWorld();
        const screen=foot.clone().project(camera);
        assert.ok(Math.abs(screen.x)<.72 && screen.y<-.55 && screen.y>-.95);
        let ridge=-Infinity;
        for(let z=420;z<view.eye.z;z+=.5){
          const x=view.eye.x+(foot.x-view.eye.x)*(z-view.eye.z)/(foot.z-view.eye.z);
          ridge=Math.max(ridge,new Vector3(x,overlookHeight(x,z),z).project(camera).y);
        }
        const shoulders=foot.clone().add(new Vector3(0,.55,0)).project(camera);
        assert.ok(shoulders.y>ridge && ridge-screen.y<.015);
      }
    }
  }
});

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
