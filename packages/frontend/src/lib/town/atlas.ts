import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { buildLane, combine } from '../village/scenery.js';
import { atmosphere } from '../village/atmosphere.js';
import { loadModels, model } from './landscape.js';
import type { District } from './districts.js';

export async function createAtlas(canvas:HTMLCanvasElement, pick:(id:string)=>void) {
  const library=await loadModels(new Set(['tree_oak','tree_detailed_fall','tree_pineRoundA','flower_yellowA',
    'crops_leafsStageB','fence_simple','stall-red','stall-green','canoe','character-female-a','character-male-c','character-worker']));
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.14;
  const scene=new T.Scene();
  scene.background=new T.Color('#e6c7b3');
  scene.fog=new T.FogExp2('#c4bfaf',.012);
  const light=new T.DirectionalLight('#ffddab',3.1);
  light.position.set(-18,26,-18);
  const span=32;
  Object.assign(light.shadow.camera,{left:-span,right:span,top:span,bottom:-span,far:110});
  light.shadow.mapSize.set(1536,1536);light.shadow.normalBias=.04;light.castShadow=true;
  scene.add(light,new T.HemisphereLight('#dce3ee','#879277',1.3));
  const lane=buildLane(scene,true);
  const banks=[lane.nearBank,lane.farBank];
  scene.remove(...banks);
  combine(scene);combine(lane.door);
  scene.add(...banks);
  let alive=true;
  const sky=new T.CubeTextureLoader().setPath('/town/sky/').load(
    ['px.webp','nx.webp','py.webp','ny.webp','pz.webp','nz.webp'], map=>{if(alive)scene.background=map;}
  );
  sky.colorSpace=T.SRGBColorSpace;
  const air=atmosphere(scene,sky,renderer);
  const camera=new T.PerspectiveCamera(34,1,.1,320);
  const controls=new OrbitControls(camera,canvas);
  controls.target.set(-1,.3,-11);
  camera.position.copy(controls.target).add(new T.Vector3(12,10,17));
  controls.minDistance=7;controls.maxDistance=57;controls.minPolarAngle=.43;controls.maxPolarAngle=1.34;
  controls.screenSpacePanning=false;controls.rotateSpeed=.64;controls.update();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=false,elapsed=Date.now()/1000%3600,last=0,frame=0;
  const still=()=>paused||reduced.matches;
  const box=new T.BoxGeometry(1,1,1);
  const lampBulb=new T.SphereGeometry(.15,10,8);
  const lampLight=new T.MeshBasicMaterial({color:'#ffe0a2',toneMapped:false});
  const stone=new T.MeshStandardMaterial({color:'#a39882',roughness:.94});
  const timber=new T.MeshStandardMaterial({color:'#6c5442',roughness:.9});
  const bed=new T.MeshStandardMaterial({color:'#665640',roughness:1});
  const planted=new T.Group();scene.add(planted);
  type Block={market?:District;period:number;phase:number;root:T.Group;signature:string;animate:((time:number,dt:number)=>void)[];cleanup:(()=>void)[]};
  const blocks=new Map<string,Block>();
  const growth:{object:T.Object3D;age:number}[]=[];
  let latestPage='',pendingReveal='',target:T.Vector3|null=null;
  function focus(x:number,z:number){
    target=new T.Vector3(x,.55,z);
    if(still()){
      camera.position.sub(controls.target).setLength(18).add(target);
      controls.target.copy(target);target=null;controls.update();
    }
  }
  function shape(parent:T.Object3D,mat:T.Material,x:number,y:number,z:number,w:number,h:number,d:number) {
    const mesh=new T.Mesh(box,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);
    mesh.receiveShadow=true;mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  function lamp(parent:T.Object3D,x:number,z:number){
    shape(parent,timber,x,.62,z,.07,1.25,.07);
    const orb=new T.Mesh(lampBulb,lampLight);orb.position.set(x,1.32,z);parent.add(orb);
  }
  function populate(district:District,block:Block) {
    const root=block.root;
    root.position.set(district.x,0,district.z);
    root.userData.district=district.id;
    const add=(parent:T.Object3D,name:string,x:number,z:number,size:number,angle=0)=>{
      const item=model(library,name,x,0,z,size,angle);parent.add(item);return item;
    };
    const counts={garden:0,grove:0,lane:0,market:0};
    const plots=new Map<string,T.Group>();
    const sprouts:T.Object3D[]=[];
    const walkers=Math.min(4,Math.ceil(district.pages.length/2));
    for(const {entry,activity,crossing} of district.pages){
      const i=counts[activity]++;
      let feature=plots.get(activity);
      if(!feature){
        feature=new T.Group();plots.set(activity,feature);root.add(feature);
        const offsets=[[0,0],[2.2,.6],[-2.1,1.0],[.25,2.2]];
        const offset=offsets[plots.size-1]!;
        feature.position.set(offset[0]!,0,offset[1]!);
      }
      const piece=new T.Group();feature.add(piece);
      const a=i*2.39996;
      const radius=.65*Math.sqrt(Math.min(10,i));
      piece.position.set(Math.cos(a)*radius,0,Math.sin(a)*radius);
      if(activity==='grove'){
        add(piece,['tree_oak','tree_detailed_fall','tree_pineRoundA'][i%3]!,0,0,1.55+Math.min(i,.9)*.4,a);
        add(piece,'flower_yellowA',.65,.35,1.4,a);
      }else if(activity==='garden'){
        piece.position.set((i%3-1)*1.05,0,(Math.floor(i/3)-1)*.93);
        shape(piece,bed,0,.05,0,.99,.1,.87);
        for(let j=0;j<4;j++) sprouts.push(add(piece,i%2?'flower_yellowA':'crops_leafsStageB',j%2*.43-.22,Math.floor(j/2)*.4-.2,1.8,a));
        if(i===0)add(piece,'fence_simple',0,-.57,1.15);
      }else if(activity==='market'){
        piece.position.set((i%2)*1.55,0,Math.floor(i/2)*1.65);
        add(piece,i%2?'stall-red':'stall-green',0,0,1.45,a*.15);lamp(piece,-.85,.4);
      }else if(activity==='lane'){
        piece.position.set((i%4)*.8-.8,0,Math.floor(i/4)*.77);
        shape(piece,stone,0,.026,.7,1.12,.06,.8);
        if(i%2===0)lamp(piece,-.45,.1);
      }
      if(entry.id===latestPage && !still())growth.push({object:piece,age:0});
      if(crossing && district.landing?.entry.id===entry.id){

        const landing=new T.Group();root.add(landing);
        const quayX=district.x+(district.z+10)*.12;
        landing.position.set(quayX-district.x,0,-14-district.z);
        const routeLength=district.z+14;
        shape(root,stone,0,.012,-routeLength/2,.5,.047,routeLength);
        for(const z of [0,-9.8]){
          shape(landing,timber,0,-.12,z,1.32,.19,2.3);lamp(landing,.6,z);
        }
        const boat=add(landing,'canoe',0,0,1.65);
        const passenger=clone(library.get('character-male-c')!.scene);
        passenger.position.y=.18;passenger.scale.setScalar(.48);boat.add(passenger);
        for(let i=0;i<3;i++)add(landing,'flower_yellowA',i*.52-.4,-11,1.4,i);
        block.animate.push(t=>{
          const phase=t*.14;
          boat.position.set(.48+Math.sin(phase)*.31,-.39+.02*Math.sin(t),-4.9-4.1*Math.cos(phase));
          boat.rotation.y=Math.atan2(.31*Math.cos(phase),4.1*Math.sin(phase));
        });
        if(entry.id===latestPage&&!still())growth.push({object:landing,age:0});
      }
    }
    if(sprouts.length)block.animate.push(t=>{
      const age=block.market?((t+block.phase)%block.period)/block.period:1;
      const height=.55+1.25*T.MathUtils.smoothstep(age,.08,.94);
      for(const crop of sprouts)crop.scale.y=height;
    });
    if(district.pages.length>=3){
      const home=new T.Group();lane.cottage(0,0,2.8,2.2,'#adaa88','#98634e',home);
      home.position.set(-1,0,-1.55);home.scale.setScalar(.78);root.add(home);
    }
    for(let i=0;i<walkers;i++){
      const source=library.get(i%2?'character-female-a':'character-worker')!;
      const actor=clone(source.scene);actor.scale.setScalar(.95);root.add(actor);
      const mixer=new T.AnimationMixer(actor);
      const walk=source.animations.find(c=>c.name==='walk');if(walk)mixer.clipAction(walk).play();
      const basket=new T.Group();actor.add(basket);
      shape(basket,timber,0,.63,.37,.44,.25,.3);
      add(basket,'crops_leafsStageB',0,.37,.68).position.y=.70;
      block.cleanup.push(()=>{mixer.stopAllAction();mixer.uncacheRoot(actor);});
      block.animate.push((t,dt)=>{
        const phase=t*.26+i*2.1;
        actor.position.set(Math.sin(phase)*1.75,.015,1.4+Math.cos(phase)*.7+i*.22);
        actor.rotation.y=Math.atan2(1.75*Math.cos(phase),-.7*Math.sin(phase));
        basket.visible=false;
        if(i===0 && block.market){
          const u=((t+block.phase)%block.period)/block.period;
          const outward=u<.5;
          const f=T.MathUtils.smoothstep(outward?2*u:2-2*u,.06,.94);
          const dx=block.market.x-district.x+1.25,dz=block.market.z-district.z;
          actor.position.set(f*dx,.02,1.4+f*dz);
          actor.rotation.y=Math.atan2(dx,dz)+(outward?0:Math.PI);
          basket.visible=outward;
        }
        if(dt)mixer.update(dt);
      });
    }
    const width=2.9+Math.min(4,Math.log2(district.pages.length));
    shape(root,stone,0,0,1.66,width,.044,.58);
  }

  function remove(block:Block){
    block.cleanup.forEach(fn=>fn());planted.remove(block.root);
    for(let i=growth.length-1;i>=0;i--){
      if(block.root.getObjectById(growth[i]!.object.id))growth.splice(i,1);
    }
  }
  function update(districts:District[]){
    const ids=new Set(districts.map(d=>d.id));
    for(const [id,block] of blocks)if(!ids.has(id)){remove(block);blocks.delete(id);}
    let width=420;
    for(const district of districts){
      width=Math.max(width,2*Math.abs(district.x)+42);
      const signature=district.pages.map(p=>p.entry.id+p.activity+Boolean(p.crossing)).join('|');
      const old=blocks.get(district.id);
      if(old?.signature===signature && old.root.position.x===district.x && old.root.position.z===district.z)continue;
      if(old)remove(old);
      const block:Block={period:32,phase:6,root:new T.Group(),signature,animate:[],cleanup:[]};
      blocks.set(district.id,block);planted.add(block.root);populate(district,block);
    }
    const markets=districts.filter(d=>d.pages.some(p=>p.activity==='market'));
    for(const d of districts){
      if(!d.pages.some(p=>p.activity==='garden'))continue;
      const block=blocks.get(d.id)!;
      block.market=markets.filter(m=>m.farBank===d.farBank).reduce<District|undefined>((nearest,m)=>
        !nearest || Math.hypot(m.x-d.x,m.z-d.z)<Math.hypot(nearest.x-d.x,nearest.z-d.z)?m:nearest,undefined);
      if(block.market)block.period=Math.max(18,2.8*Math.hypot(block.market.x-d.x,block.market.z-d.z));
    }
    banks.forEach(b=>b.scale.x=width);air.updateRiverBanks(width+10);
    const reveal=districts.find(d=>d.pages.some(p=>p.entry.id===pendingReveal));
    if(reveal){focus(reveal.x,reveal.z);pendingReveal='';}
    latestPage='';
  }
  function render(dt:number) {
    const step=still()?0:dt;
    elapsed+=step;lane.wind.value+=step;
    if(target){
      const offset=target.clone().sub(controls.target);
      const distance=camera.position.distanceTo(controls.target);
      const blend=still()?1:1-Math.exp(-dt*4.2);
      offset.multiplyScalar(blend);
      camera.position.sub(controls.target).setLength(T.MathUtils.lerp(distance,18,blend));
      controls.target.add(offset);camera.position.add(controls.target);
      if(controls.target.distanceToSquared(target)<.012 && Math.abs(distance-18)<.1)target=null;
    }
    const visibleDistance=Math.max(44,camera.position.distanceTo(controls.target)*(1+camera.aspect));
    for(const b of blocks.values()){
      b.root.visible=b.root.position.distanceTo(controls.target)<visibleDistance;
      if(b.root.visible)b.animate.forEach(fn=>fn(elapsed,step));
    }
    for(let i=growth.length-1;i>=0;i--){
      const g=growth[i]!;g.age=still()?1:Math.min(1,g.age+(target?0:step)*.95);
      g.object.scale.setScalar(.02+.98*T.MathUtils.smoothstep(g.age,0,1));
      if(g.age>=1)growth.splice(i,1);
    }
    controls.update();air.update(step,still(),false,camera);renderer.render(scene,camera);
  }
  function loop(now:number){
    frame=requestAnimationFrame(loop);
    if(now-last<33)return;
    const dt=last?Math.min(.08,(now-last)/1000):0;last=now;render(dt);
  }
  function visibility(){cancelAnimationFrame(frame);last=0;if(!document.hidden)frame=requestAnimationFrame(loop);}
  const resize=new ResizeObserver(()=>{
    const {width,height}=canvas.getBoundingClientRect();
    if(!width||!height)return;
    camera.aspect=width/height;camera.fov=width<600?47:34;camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);air.resize(height*renderer.getPixelRatio());render(0);
  });
  const ray=new T.Raycaster();
  let down:T.Vector2|null=null;
  const start=(e:PointerEvent)=>{target=null;down=e.isPrimary?new T.Vector2(e.clientX,e.clientY):null;};
  const end=(e:PointerEvent)=>{
    if(!down||down.distanceTo(new T.Vector2(e.clientX,e.clientY))>6)return;
    down=null;const rect=canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
    for(const hit of ray.intersectObject(planted,true)){
      for(let o:T.Object3D|null=hit.object;o;o=o.parent)if(o.userData.district){pick(o.userData.district);return;}
    }
  };
  function key(e:KeyboardEvent){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;
    e.preventDefault();target=null;
    if(e.key==='Home')focus(-1,-11);
    else if(e.key==='ArrowLeft'||e.key==='ArrowRight')controls.rotateLeft(e.key==='ArrowLeft'?.22:-.22);
    else if(e.key==='ArrowUp'||e.key==='ArrowDown')controls.pan(0,e.key==='ArrowUp'?45:-45);
    else {const delta=camera.position.clone().sub(controls.target);delta.setLength(T.MathUtils.clamp(delta.length()*(e.key==='-'?1.22:.82),7,57));camera.position.copy(controls.target).add(delta);}
    controls.update();
  }
  canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointerup',end);canvas.addEventListener('keydown',key);
  resize.observe(canvas);document.addEventListener('visibilitychange',visibility);visibility();
  return {update,focus,reveal(id:string){latestPage=pendingReveal=id;},pause(value:boolean){paused=value;},destroy(){
    alive=false;cancelAnimationFrame(frame);resize.disconnect();controls.dispose();document.removeEventListener('visibilitychange',visibility);
    canvas.removeEventListener('pointerdown',start);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('keydown',key);
    for(const b of blocks.values())remove(b);
    const geometries=new Set<T.BufferGeometry>([box,lampBulb]),materials=new Set<T.Material>([stone,timber,lampLight,bed]),textures=new Set<T.Texture>(lane.disposables);
    function collect(o:T.Object3D){o.traverse(n=>{
      if(n instanceof T.InstancedMesh)n.dispose();
      if(!(n instanceof T.Mesh || n instanceof T.Points))return;
      geometries.add(n.geometry);
      for(const m of Array.isArray(n.material)?n.material:[n.material]){materials.add(m);if(m.map)textures.add(m.map);}
    });}
    collect(scene);library.forEach(asset=>collect(asset.scene));
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    air.dispose();sky.dispose();light.shadow.dispose();renderer.dispose();
  }};
}
