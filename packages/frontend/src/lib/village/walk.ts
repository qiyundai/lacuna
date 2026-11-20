import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { birdHabit, gesture, type Presence } from '../../../../shared/village.js';
import { atmosphere } from './atmosphere.js';
import { buildLane, combine, loadResidentModels } from './scenery.js';

export const stops = {
  cabin: [0,4.8], eaves:[.2,-2.55], river:[.7,-11.9], garden:[-4.65,-5.6], bindery:[4.8,-4.9]
} as const;
export type Place=keyof typeof stops;
const views:Record<Place,[number,number]>={cabin:[-.9,-3],eaves:[1.5,-12],river:[3.4,-17],garden:[-5.4,-7.6],bindery:[5.7,-7.6]};

export async function walkScene(canvas:HTMLCanvasElement,onPlace:(place:Place)=>void,onUse:()=>void,onBird:(id:string)=>void) {
  const models=await loadResidentModels();
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  const scene=new T.Scene();
  scene.background=new T.Color('#e4d9ba');scene.fog=new T.FogExp2('#a6bbb1',.025);
  const camera=new T.PerspectiveCamera(60,1,.05,180);
  const hemi=new T.HemisphereLight('#d9e7ee','#85968a',1.04);scene.add(hemi);
  const sun=new T.DirectionalLight('#ffdaaa',3.05);
  sun.position.set(-9,9,-14);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);
  Object.assign(sun.shadow.camera,{left:-19,right:19,top:19,bottom:-19,far:70});sun.shadow.normalBias=.036;scene.add(sun);
  const lane=buildLane(scene);
  combine(scene);combine(lane.door);
  let disposed=false;
  const skyMap=new T.CubeTextureLoader().setPath('/town/sky/').load(
    ['px.webp','nx.webp','py.webp','ny.webp','pz.webp','nz.webp'],
    sky=>{if(!disposed)scene.background=sky;}
  );
  skyMap.colorSpace=T.SRGBColorSpace;
  const air=atmosphere(scene,skyMap,renderer);
  for(const [model,x,z] of [[models.gardener,-5.35,-7.65],[models.binder,5.65,-7.4]] as const){
    const resident=clone(model.scene), bounds=new T.Box3().setFromObject(resident);
    resident.scale.setScalar(1.53/(bounds.max.y-bounds.min.y));resident.position.set(x,-bounds.min.y*resident.scale.y,z);resident.rotation.y=.2;scene.add(resident);
  }
  const birds=new Map<string,{object:T.Object3D;group:Presence;anchor:T.Vector3;scale:number}>();
  const destination=new T.Vector3(),birdTarget=new T.Vector3();
  let place:Place='cabin',yaw=0,pitch=0,doorOpen=false,paused=false,elapsed=0,previous=performance.now();
  let onArrival:(()=>void)|null=null;
  let raining=false;
  let chosen='',travel=false,watchingFromBank=false,turnTo:number|null=null,aimPitch=0,frameId=0;
  const keys=new Set<string>(),ray=new T.Raycaster(),ndc=new T.Vector2();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let quiet=false;
  const still=()=>quiet||reduced.matches;
  const eye=1.51;
  function facing(x:number,z:number){return Math.atan2(camera.position.x-x,camera.position.z-z);}
  function moveTo(next:Place,immediate=false) {
    onArrival=null;
    const [x,z]=stops[next];destination.set(x,eye,z);
    const [fx,fz]=views[next];
    turnTo=Math.atan2(x-fx,z-fz);aimPitch=next==='cabin'?-.10:-.048;
    watchingFromBank=next==='river';
    const riversideBird=watchingFromBank && birds.get(chosen);
    if(riversideBird){
      const perch=riversideBird.anchor;
      destination.set(T.MathUtils.clamp(perch.x-1.5,-3.4,3.4),eye,Math.min(-9.9,perch.z+3));
      turnTo=Math.atan2(destination.x-perch.x,destination.z-perch.z);
      aimPitch=Math.atan2(.55-eye,Math.hypot(destination.x-perch.x,destination.z-perch.z));
    }
    if(immediate || still()){camera.position.copy(destination);yaw=turnTo;pitch=aimPitch;turnTo=null;travel=false;}
    else travel=true;
  }
  moveTo('cabin',true);
  function nearest(){
    const p=camera.position;
    if(p.z>-.65)return 'cabin';
    if(p.z<-9.5)return 'river';
    if(p.x<-3.5 && p.z<-3)return 'garden';
    if(p.x>3.5 && p.z<-3)return 'bindery';
    return 'eaves';
  }
  function walk(x:number,z:number) {
    const p=camera.position;
    const nz=T.MathUtils.clamp(z,-13.25,5.8);
    const nx=T.MathUtils.clamp(x,nz>-.9?-2.75:-5.25,nz>-.9?1.0:5.25);
    if(nz<-6.1 && Math.abs(nx)>3.4){p.x=T.MathUtils.clamp(nx,-4.2,4.2);p.z=Math.max(nz,-6.1);}
    else {p.x=nx;p.z=nz;}
  }
  function update(groups:Presence[],selected:string,open:boolean){
    chosen=selected;doorOpen=open;
    const visible=groups.slice(-12);
    const focus=groups.find(group=>group.id===selected);
    if(focus && !visible.includes(focus))visible[0]=focus;
    const activeIds=new Set(visible.map(g=>g.id));
    for(const [id,bird] of birds)if(!activeIds.has(id)){bird.object.removeFromParent();birds.delete(id);}
    const entry=focus?.entries.at(-1);
    const forecast=entry && (entry.reading?.gesture ?? gesture(entry.body))==='forecast';
    raining=!!forecast || (!!focus && ['lead','return-to-door','wait-for-you','rest'].includes(birdHabit(focus)));
    for(const [i,group] of visible.entries()){
      let bird=birds.get(group.id);
      if(!bird){
        const object=clone(models.bird.scene);
        const seed=Array.from(group.id).reduce((n,ch)=>(n*31+ch.charCodeAt(0))>>>0,0);
        const scale=.21+(seed%19)/270;object.scale.setScalar(scale);
        const anchor=new T.Vector3(-3+(i%7)*1.15,.02,-12.8-Math.floor(i%21/7)*.65);
        object.position.copy(anchor);object.userData.presence=group.id;
        bird={object,group,anchor,scale};scene.add(object);birds.set(group.id,bird);
      }
      bird.group=group;
    }
  }
  const rainGeometry=new T.BufferGeometry();
  const drops=new Float32Array(100*6);
  for(let i=0;i<100;i++){
    const off=i*6,x=(i*37%101)/101*14-7,y=(i*61%103)/103*5,z=-1-(i*71%107)/107*12;
    drops.set([x,y,z,x+.016,y-.18,z],off);
  }
  rainGeometry.setAttribute('position',new T.BufferAttribute(drops,3));
  const rain=new T.LineSegments(rainGeometry,new T.LineBasicMaterial({color:'#dfecdf',transparent:true,opacity:.28,depthWrite:false}));scene.add(rain);
  function frame(now:number){
    frameId=requestAnimationFrame(frame);
    const dt=Math.min((now-previous)/1000,.06);previous=now;
    if(document.hidden || paused || disposed)return;
    elapsed+=dt;
    if(travel && still()){camera.position.copy(destination);travel=false;}
    if(travel){
      const distance=camera.position.distanceTo(destination);
      if(distance<.06){camera.position.copy(destination);travel=false;}
      else camera.position.lerp(destination,Math.min(1,dt*3.6/distance));
    }
    const active=birds.get(chosen);
    if(watchingFromBank && !travel && active){
      const p=active.object.position;
      turnTo=facing(p.x,p.z);
      aimPitch=Math.atan2(p.y+active.scale*2.5-eye,Math.hypot(camera.position.x-p.x,camera.position.z-p.z));
      if(still()){yaw=turnTo;pitch=aimPitch;turnTo=null;}
    }
    if(turnTo!==null){
      const delta=Math.atan2(Math.sin(turnTo-yaw),Math.cos(turnTo-yaw));
      yaw+=delta*Math.min(1,dt*6);pitch=T.MathUtils.lerp(pitch,aimPitch,Math.min(1,dt*6));
      if(Math.abs(delta)<.004 && Math.abs(pitch-aimPitch)<.004)turnTo=null;
    }
    if(keys.size){
      const forward=Number(keys.has('w')||keys.has('ArrowUp'))-Number(keys.has('s')||keys.has('ArrowDown'));
      const right=Number(keys.has('d'))-Number(keys.has('a'));
      yaw+=(Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight')))*dt*1.5;
      walk(camera.position.x+(-Math.sin(yaw)*forward+Math.cos(yaw)*right)*dt*2.6,camera.position.z+(-Math.cos(yaw)*forward-Math.sin(yaw)*right)*dt*2.6);
    }
    const current=nearest();if(current!==place){place=current;onPlace(current);}
    if(!travel && onArrival){const done=onArrival;onArrival=null;done();}
    camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0,'YXZ');
    lane.door.position.x=T.MathUtils.lerp(lane.door.position.x,doorOpen?3.55:1.95,still()?1:Math.min(1,dt*4));
    const habit=active && birdHabit(active.group);
    rain.visible=raining && !still();
    if(rain.visible){
      for(let i=0;i<drops.length;i+=6){drops[i+1]=(drops[i+1]!-dt*2.3+5)%5;drops[i+4]=drops[i+1]!-.18;}
      rainGeometry.attributes.position!.needsUpdate=true;
    }
    for(const [id,bird] of birds){
      birdTarget.copy(bird.anchor);
      const activeHabit=id===chosen?habit:'forage';
      if(activeHabit==='rest')birdTarget.set(1.82,.23,-.72);
      else if(activeHabit==='return-to-door')birdTarget.set(2.2,.02,-2.8);
      else if(activeHabit==='lead') {
        const noticed=bird.group.entries.at(-1)?.traces?.includes('noticed');
        birdTarget.set(noticed?1.85:1.36,noticed ? .23 : .955,noticed?-1.15:-5.6);
      } else if(activeHabit==='wait-for-you')birdTarget.set(1.7,.02,-5.1);
      const obj=bird.object,dist=obj.position.distanceTo(birdTarget);
      if(still())obj.position.copy(birdTarget);
      else if(dist>.05){
        const nextY=birdTarget.y+Math.min(1.1,dist*.24);
        obj.rotation.y=Math.atan2(birdTarget.x-obj.position.x,birdTarget.z-obj.position.z);
        obj.position.x=T.MathUtils.damp(obj.position.x,birdTarget.x,1,dt);obj.position.z=T.MathUtils.damp(obj.position.z,birdTarget.z,1,dt);
        obj.position.y=T.MathUtils.damp(obj.position.y,nextY,1.5,dt);
      }
      if(!still()){
        obj.rotation.z=Math.sin(elapsed*(dist>.15?6:.8)+bird.scale*100)*(dist>.15?.035:.008);
        obj.rotation.x=Math.sin(elapsed*(dist>.15?3:.4))*(dist>.15?.04:.012);
      }
    }
    air.update(dt,still(),raining,camera);
    if(!still())lane.wind.value+=dt;
    renderer.render(scene,camera);
  }
  function resize(){const {width,height}=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,width),Math.max(1,height),false);camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();air.resize(height*renderer.getPixelRatio());}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  let drag:{id:number;x:number;y:number;prevX:number;prevY:number;moved:boolean}|null=null;
  function down(e:PointerEvent){if(paused||drag)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,prevX:e.clientX,prevY:e.clientY,moved:false};}
  function move(e:PointerEvent){if(!drag||drag.id!==e.pointerId)return;
    if(Math.hypot(drag.x-e.clientX,drag.y-e.clientY)>5)drag.moved=true;
    if(drag.moved){onArrival=null;travel=false;watchingFromBank=false;turnTo=null;yaw-=(e.clientX-drag.prevX)*.004;pitch=T.MathUtils.clamp(pitch-(e.clientY-drag.prevY)*.003,-.85,Math.PI/2);}
    drag.prevX=e.clientX;drag.prevY=e.clientY;
  }
  function up(e:PointerEvent){
    if(!drag||drag.id!==e.pointerId)return;
    const tapped=!drag.moved;drag=null;
    if(!tapped || paused)return;
    const bounds=canvas.getBoundingClientRect();ndc.set((e.clientX-bounds.left)/bounds.width*2-1,1-(e.clientY-bounds.top)/bounds.height*2);
    ray.setFromCamera(ndc,camera);
    const birdsHit=ray.intersectObjects([...birds.values()].map(b=>b.object),true)[0];
    if(birdsHit && birdsHit.distance<14){let node:T.Object3D|null=birdsHit.object;while(node&&!node.userData.presence)node=node.parent;if(node){onBird(node.userData.presence);return;}}
    const hit=ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),new T.Vector3());
    if(!hit)return;
    const candidates=Object.entries(stops) as [Place,readonly[number,number]][];
    const nearest=candidates.sort((a,b)=>Math.hypot(hit.x-a[1][0],hit.z-a[1][1])-Math.hypot(hit.x-b[1][0],hit.z-b[1][1]))[0];
    if(nearest)moveTo(nearest[0]);
  }
  function clear(){keys.clear();drag=null;}
  function key(e:KeyboardEvent){if(paused)return;const val=e.key.length===1?e.key.toLowerCase():e.key;
    if(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(val)){e.preventDefault();onArrival=null;travel=false;watchingFromBank=false;turnTo=null;keys.add(val);}
    if(val==='Enter'&&!e.repeat){e.preventDefault();onUse();}
  }
  function keyup(e:KeyboardEvent){keys.delete(e.key.length===1?e.key.toLowerCase():e.key);}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',clear);
  canvas.addEventListener('keydown',key);canvas.addEventListener('keyup',keyup);canvas.addEventListener('blur',clear);
  frameId=requestAnimationFrame(frame);
  function look(x:number,y:number,z:number){
    watchingFromBank=false;
    turnTo=facing(x,z);aimPitch=Math.atan2(y-eye,Math.max(.1,Math.hypot(x-camera.position.x,z-camera.position.z)));
    if(still()){yaw=turnTo;pitch=aimPitch;turnTo=null;}
  }
  function approachBird(id:string,done:()=>void){
    watchingFromBank=false;
    const bird=birds.get(id);if(!bird){done();return;}
    const p=bird.object.position;
    const z=p.z> -2 ? p.z-2.35 : p.z+2.0;
    destination.set(T.MathUtils.clamp(p.x-.65,-3,3),eye,z);
    turnTo=Math.atan2(destination.x-p.x,destination.z-p.z);
    aimPitch=Math.atan2(p.y+.55-eye,2);
    if(still()){camera.position.copy(destination);yaw=turnTo;pitch=aimPitch;turnTo=null;travel=false;}
    else travel=true;
    onArrival=done;
  }
  return {update,moveTo,approachBird,setStill(value:boolean){quiet=value;},faceDoor(){look(1.85,.94,-.25);}, pause(value:boolean){paused=value;clear();},lookAtBird(id:string){const bird=birds.get(id);if(bird){look(bird.object.position.x,bird.object.position.y+.55,bird.object.position.z);}},
    destroy(){disposed=true;cancelAnimationFrame(frameId);observer.disconnect();clear();
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',clear);
      canvas.removeEventListener('keydown',key);canvas.removeEventListener('keyup',keyup);canvas.removeEventListener('blur',clear);
      const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
      scene.traverse(o=>{if(o instanceof T.Mesh || o instanceof T.LineSegments){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>{if('map' in m && m.map instanceof T.Texture)m.map.dispose();m.dispose();});
      air.dispose();skyMap.dispose();lane.disposables.forEach(t=>t.dispose());renderer.dispose();
    }};
}
