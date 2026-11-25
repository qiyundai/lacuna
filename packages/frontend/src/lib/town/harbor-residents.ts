import * as T from 'three';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import type { Site } from './painted-coast.js';
import { hashPage } from './city-growth.js';
import { lifeStories } from './life-stories.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { siteName } from './architecture-catalog.js';
import type { ResidentHome, ResidentVisit } from './resident-lives.js';
import { doorRoute, type WaterfrontLot } from './harbor-streets.js';
import { shopperRounds, streetNetwork, walkSegment, turnTicks, walkingPose, walkingTicks, type ShopFront, type ShopperGesture } from './shopper-rounds.js';

type HarborResident = 'shopper' | 'reader';
const shopperScale = .60;
export function residentMotion(resident:HarborResident,seconds:number,length:number) {
  const tick=Math.floor(seconds*8+(resident==='reader'?.47:0));
  if(resident==='reader')return {frame:Math.floor((tick%48)/3),distance:length*.5,direction:1,turning:false};
  const walkTicks=walkingTicks(length),leg=walkTicks+turnTicks;
  const cycle=tick%(2*leg),direction=cycle<leg?1:-1,step=cycle%leg;
  const turning=step>=walkTicks;
  const stride=walkingPose(step,length);
  const frame=turning?step-walkTicks:stride.frame;
  return {frame,distance:direction===1?stride.distance:length-stride.distance,direction,turning};
}

type ResidentMotion = ReturnType<typeof residentMotion> & {gesture?:ShopperGesture;beat?:number;strength?:number};

function releaseShopper(model:GLTF){
  const materials=new Set<T.Material>(),skeletons=new Set<T.Skeleton>();
  model.scene.traverse(part=>{
    if(!(part instanceof T.Mesh))return;
    part.geometry.dispose();
    for(const material of Array.isArray(part.material)?part.material:[part.material])materials.add(material);
    if(part instanceof T.SkinnedMesh)skeletons.add(part.skeleton);
  });
  const maps=new Set<T.Texture>();
  for(const material of materials){
    if(material instanceof T.MeshStandardMaterial && material.map)maps.add(material.map);
    material.dispose();
  }
  for(const map of maps){
    map.dispose();
    if(typeof ImageBitmap!=='undefined' && map.image instanceof ImageBitmap)map.image.close();
  }
  for(const skeleton of skeletons)skeleton.dispose();
}

function figures(){
  const files=new Map<string,{asset:Promise<GLTF>;users:number}>();
  const loader=new GLTFLoader();
  function trim(){
    const idle=[...files].filter(([,file])=>file.users===0);
    for(const [name,file] of idle.slice(0,Math.max(0,idle.length-4))){
      files.delete(name);file.asset.then(releaseShopper,()=>{});
    }
  }
  return {
    acquire(path:string){
      let file=files.get(path);
      if(!file){
        file={asset:loader.loadAsync('/city/residents/'+path),users:0};
        files.set(path,file);
        const current=file;
        file.asset.catch(()=>{if(files.get(path)===current)files.delete(path);});
      }
      file.users++;
      return {asset:file.asset,release(){file.users--;trim();}};
    },
    dispose(){for(const file of files.values())file.asset.then(releaseShopper,()=>{});files.clear();}
  };
}

function shopperFigure(home:ResidentHome,assets:ReturnType<typeof figures>,redraw:()=>void) {
  const root=new T.Group();
  root.name=home.resident;root.visible=false;root.scale.setScalar(shopperScale);
  if(!home.life.tomas)root.scale.multiplyScalar(.975+(hashPage(home.resident+'/height')%6)/100);
  let disposed=false,model:GLTF|undefined,mixer:T.AnimationMixer|undefined;
  let walk:T.AnimationAction|undefined,turn:T.AnimationAction|undefined,active:T.AnimationAction|undefined;
  let head:T.Object3D|undefined,arm:T.Object3D|undefined,elbow:T.Object3D|undefined,bagArm:T.Object3D|undefined;
  const rest=[new T.Quaternion(),new T.Quaternion(),new T.Quaternion(),new T.Quaternion()];
  const note=new T.Mesh(new T.BoxGeometry(.12,.009,.085),new T.MeshStandardMaterial({color:0xf2ddaa,roughness:1}));
  note.name=home.life.tomas?'Nell’s recipe card':'Pocket notebook';note.visible=false;note.castShadow=note.receiveShadow=true;
  note.position.set(0,.245,.027);note.rotation.z=.21;
  let beat=-1;
  const fabric=new Map<T.Material,T.MeshStandardMaterial>();
  const style=lifeStories.findIndex(s=>s.key===home.life.family);
  const file=assets.acquire(home.life.family?home.life.family+'/'+home.life.build+'.gltf':'market-shopper.glb');
  file.asset.then(source=>{
    if(disposed)return;
    const loaded={...source,scene:cloneRig(source.scene) as T.Group};
    model=loaded;
    loaded.scene.traverse(part=>{
      if(!(part instanceof T.Mesh))return;
      part.castShadow=part.receiveShadow=true;
      if(part.name==='Keepsake_tag'||part.name==='Keepsaketag'||part.name==='Keepsake tag')part.visible=!!home.life.chapter;
      if(part.name.startsWith('Chapter'))part.visible=(home.life.chapter??0)>=(part.name.includes('two')?2:3);
      const dyed=(mat:T.Material)=>{
        if(home.life.tomas || !(mat instanceof T.MeshStandardMaterial) || !['Sea glass','Deep harbor','Warm clay','Indigo'].includes(mat.name))return mat;
        if(!fabric.has(mat)){
          const copy=mat.clone();
          if(mat.name==='Warm clay')copy.color.setHex([0xbe866b,0xd59a71,0x965c43,0x82523f,0xe3af89,0xb57854][hashPage(home.resident+'/clay')%6]!);
          else if(mat.name==='Indigo')copy.color.multiply(new T.Color([0xfff0da,0xc6e1d1,0xd7c9e4][hashPage(home.resident+'/trousers')%3]!));
          else copy.color.multiply(new T.Color(home.life.tint));
          fabric.set(mat,copy);
        }
        return fabric.get(mat)!;
      };
      part.material=Array.isArray(part.material)?part.material.map(dyed):dyed(part.material);
    });
    root.add(loaded.scene);
    head=loaded.scene.getObjectByName('Head');
    arm=loaded.scene.getObjectByName('SleeveR');
    elbow=loaded.scene.getObjectByName('CuffR');
    bagArm=loaded.scene.getObjectByName('CuffL');
    elbow?.add(note);
    mixer=new T.AnimationMixer(loaded.scene);
    for(const clip of loaded.animations){
      if(clip.name==='Market walk'){
        walk=mixer.clipAction(clip).setLoop(T.LoopOnce,1);
        walk.clampWhenFinished=true;
      }
      if(clip.name==='Market turnaround')turn=mixer.clipAction(clip);
    }
    redraw();
  }).catch(()=>redraw());
  return {root,life:home.life,
    pose(motion:ResidentMotion,tangent:T.Vector3){
      root.rotation.y=Math.atan2(tangent.x,tangent.z)+(motion.direction<0?Math.PI:0);
      const next=motion.turning?turn:walk;
      if(!next || !mixer)return false;
      const time=motion.frame/8;
      const tick=motion.gesture?motion.beat??0:-1;
      if(active===next && next.time===time && beat===tick)return false;
      if(beat>=0 && head && arm && elbow && bagArm){
        head.quaternion.copy(rest[0]!);arm.quaternion.copy(rest[1]!);elbow.quaternion.copy(rest[2]!);
        bagArm.quaternion.copy(rest[3]!);
      }
      if(active!==next){
        active?.stop();
        next.reset().play();
        next.paused=true;
        active=next;
      }
      next.time=time;
      mixer.update(0);
      beat=tick;
      note.visible=motion.gesture==='read';
      if(motion.gesture && head && arm && elbow && bagArm){
        rest[0]!.copy(head.quaternion);rest[1]!.copy(arm.quaternion);rest[2]!.copy(elbow.quaternion);
        rest[3]!.copy(bagArm.quaternion);
        const envelope=motion.strength??0;
        if(motion.gesture==='bag'){
          head.rotateX(envelope*.28);head.rotateZ(-envelope*.23);
          bagArm.rotateX(-envelope*.52);
          arm.rotateX(-envelope*.50);arm.rotateZ(envelope*.32);
          elbow.rotateX(-envelope*(.50+.12*Math.sin(tick*.38)));
        }else if(motion.gesture==='greet'){
          head.rotateZ(envelope*.18);arm.rotateX(-envelope*1.12);
          elbow.rotateX(-envelope*.85);elbow.rotateZ(envelope*.26*Math.sin(tick*.65));
        }else{
          head.rotateX(envelope*.24);head.rotateZ(envelope*(.10+.04*Math.sin(tick*.24)));
          arm.rotateX(-envelope*.55);elbow.rotateX(-envelope*.92);elbow.rotateZ(envelope*.22);
        }
      }
      if(style>=0 && motion.gesture && bagArm && arm && elbow && head){
        const strength=motion.strength??0;
        const [lift,roll,reach,nod,tempo]=workPoses[style]!;
        const wave=Math.sin(tick*tempo);
        bagArm.rotateX(strength*(lift+.10*wave));bagArm.rotateZ(strength*roll);
        arm.rotateZ(strength*reach);elbow.rotateX(strength*wave*.19);head.rotateX(strength*nod);
      }
      return true;
    },
    dispose(){
      disposed=true;
      note.removeFromParent();note.geometry.dispose();note.material.dispose();
      if(model){mixer?.stopAllAction();mixer?.uncacheRoot(model.scene);model.scene.traverse(o=>{if(o instanceof T.SkinnedMesh)o.skeleton.dispose();});}
      for(const material of fabric.values())material.dispose();
      file.release();
    }
  };
}

const workPoses=[
  [-.54,.32,.31,.17,.21],[-.92,.49,-.21,-.12,.10],[-.78,-.16,.51,.23,.74],
  [-.66,.41,.64,.06,.16],[-1.08,.26,.15,.29,.12],[-1.34,-.27,-.12,-.24,.20],
  [-.52,-.68,-.52,-.32,.29],[-.91,.18,-.27,-.13,.72],[-.73,.47,.53,.22,.39],
  [-1.12,-.14,-.16,-.10,.13],[-.57,.28,.48,.33,.51],[-.89,.38,.42,.26,.62]
];

function routeByDoor(lot:WaterfrontLot,street:T.Vector3[],front?:ShopFront) {
  const entrance=lot.gallery[0]??front?.origin;
  if(!entrance || street.length<2)return;
  const {target}=doorRoute(entrance,street);
  const center=street.indexOf(target);
  const path=new T.CurvePath<T.Vector3>();
  const first=Math.max(0,center-3),last=Math.min(street.length-1,center+3);
  for(let i=first;i<last;i++)path.add(walkSegment(street[i]!,street[i+1]!));
  return path.getLength()>.05?path:undefined;
}

export function createHarborResidents(redraw:()=>void,weekday:number) {
  const layer=new T.Group();layer.name='Harbor residents';
  const actors=new Map<string,ReturnType<typeof shopperFigure>>();
  const assets=figures();
  let shadowDirty=false,lastSelection=-Infinity,lastFollow:string|undefined;
  const eyeAtSelection=new T.Vector3(Infinity,0,0),directionAtSelection=new T.Vector3(),bounds=new T.Sphere(new T.Vector3(),1.2);
  type Route={home:ResidentHome;path:T.CurvePath<T.Vector3>;street:T.Vector3[];stops:string[];memory?:string;task:string;location?:Site;rounds?:ReturnType<typeof shopperRounds>};
  const routes=new Map<string,Route>();
  const position=new T.Vector3(),tangent=new T.Vector3(),behind=new T.Vector3();
  function place(homes:readonly ResidentHome[],lots:WaterfrontLot[],streets:Map<number,T.Vector3[][]>,fronts:ShopFront[],walkways:T.Vector3[][]){
    routes.clear();lastSelection=-Infinity;
    const network=streetNetwork(fronts,walkways);
    for(const actor of actors.values())actor.root.visible=false;
    const now=Date.now()/1000;
    for(const home of homes){
      if(home.arrival>now)continue;
      const lot=lots.find(lot=>lot.site.id===home.site.id);
      const street=streets.get(home.site.bank)?.[home.site.kind==='wharf'?3:home.site.lane];
      const front=fronts.find(f=>f.site.id===home.site.id);
      const path=lot && street && routeByDoor(lot,street,front);
      if(!path || !street)continue;
      const rounds=front?shopperRounds(front,fronts,walkways,weekday,home.life,network):undefined;
      const stops=rounds?.visits.flatMap(v=>v.site?[siteName(v.site.kind)+' · '+v.activity.task]:[])??[];
      const remembered=rounds?.visits.find(v=>v.site && v.memory);
      const memory=remembered?.site?'At '+siteName(remembered.site.kind).replace(/^The /,'the ')+', '+remembered.memory:undefined;
      routes.set(home.resident,{home,path,street,rounds,stops,memory,task:home.life.anchor.task});
      const existing=actors.get(home.resident);
      if(existing && (existing.life.family!==home.life.family || existing.life.build!==home.life.build || existing.life.chapter!==home.life.chapter)){
        existing.root.removeFromParent();existing.dispose();actors.delete(home.resident);
      }
    }
    for(const [id,actor] of actors)if(!routes.has(id)){
      actor.root.removeFromParent();actor.dispose();actors.delete(id);
    }
    shadowDirty=true;
  }

  function sample(route:Route,seconds:number){
    return route.rounds?.sampleDay(seconds)??{path:route.path,indoors:false,
      location:undefined,motion:residentMotion('shopper',seconds,route.path.getLength()),task:route.home.life.anchor.task};
  }
  function update(seconds:number,now:number,eye:T.Vector3,frustum:T.Frustum,following?:string){
    let changed=shadowDirty;shadowDirty=false;
    if(seconds<lastSelection || seconds-lastSelection>=1 || eye.distanceToSquared(eyeAtSelection)>9 || directionAtSelection.distanceToSquared(frustum.planes[4]!.normal)>.005 || following!==lastFollow){
      lastSelection=seconds;eyeAtSelection.copy(eye);directionAtSelection.copy(frustum.planes[4]!.normal);lastFollow=following;
      const nearest=[...routes.values()].filter(r=>r.home.arrival<=now).map(route=>{
        const pose=sample(route,seconds);
        const distance=pose.path.getPoint(pose.motion.distance/pose.path.getLength(),position).distanceToSquared(eye);
        bounds.center.copy(position);bounds.center.y+=.5;
        return {route,distance,visible:!pose.indoors && frustum.intersectsSphere(bounds)};
      }).filter(p=>p.route.home.resident===following || (p.visible && p.distance<180*180))
        .sort((a,b)=>Number(b.route.home.resident===following)-Number(a.route.home.resident===following)||a.distance-b.distance);
      const selected=new Set(nearest.slice(0,matchMedia('(pointer: coarse)').matches?12:24).map(p=>p.route.home.resident));
      for(const [id,actor] of actors)if(!selected.has(id)){actor.root.removeFromParent();actor.dispose();actors.delete(id);changed=true;}
      for(const id of selected)if(!actors.has(id)){
        const actor=shopperFigure(routes.get(id)!.home,assets,()=>{shadowDirty=true;redraw();});
        actors.set(id,actor);layer.add(actor.root);changed=true;
      }
    }
    for(const [resident,actor] of actors){
      const route=routes.get(resident)!;
      const {path,motion,task,location,indoors}=sample(route,seconds),length=path.getLength();
      route.task=task;route.location=location;
      const visible=now>=route.home.arrival && !indoors;
      if(visible!==actor.root.visible)changed=true;
      actor.root.visible=visible;
      const u=motion.distance/length;
      path.getPoint(u,position);
      const stride=.5*shopperScale/length;
      path.getPoint(Math.min(1,u+stride),tangent);
      path.getPoint(Math.max(0,u-stride),behind);
      tangent.sub(behind).normalize();
      position.y+=.009;
      if(visible && !position.equals(actor.root.position))changed=true;
      actor.root.position.copy(position);
      if(visible && actor.pose(motion,tangent))changed=true;
    }
    return changed;
  }
  function focus(resident:string,seconds:number){
    const route=routes.get(resident);
    if(!route)return;
    const {path,motion}=sample(route,seconds),length=path.getLength();
    const point=path.getPoint(motion.distance/length);
    if(route.rounds){
      const eye=path.getPoint(T.MathUtils.clamp((motion.distance+(motion.distance>length/2?-3.5:3.5))/length,0,1));
      eye.y+=2.35;eye.z+=route.home.site.bank===0?.75:-.75;
      return {point,eye};
    }
    const street=route.street;
    const eyeX=point.x+(street.at(-1)!.x-point.x>=4?4:-4);
    const vantage=street.reduce((best,p)=>Math.abs(p.x-eyeX)<Math.abs(best.x-eyeX)?p:best);
    return {point,eye:vantage.clone().add(new T.Vector3(0,2.35,route.home.site.bank===0?.38:-.38))};
  }
  function positionOf(id:string){return actors.get(id)?.root.position;}
  function visit(id:string,seconds?:number):ResidentVisit|undefined{
    const route=routes.get(id);
    if(!route)return;
    const pose=seconds===undefined?route:sample(route,seconds);
    return {life:route.home.life,site:pose.location??route.home.site,stops:route.stops,memory:route.memory,task:pose.task};
  }
  function pick(ray:T.Raycaster){
    let closest=Infinity,id:string|undefined;
    for(const [key,actor] of actors){
      if(!actor.root.visible)continue;
      const hits=ray.intersectObject(actor.root,true);
      const hit=hits.find(h=>h.object.visible);
      if(hit && hit.distance<closest){closest=hit.distance;id=key;}
    }
    return id?{id,distance:closest}:undefined;
  }
  return {layer,place,update,focus,positionOf,visit,pick,dispose(){
    for(const actor of actors.values())actor.dispose();
    actors.clear();routes.clear();layer.clear();assets.dispose();
  }};
}
