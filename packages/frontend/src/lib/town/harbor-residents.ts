import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { siteName } from './architecture-catalog.js';
import type { ResidentHome, ResidentVisit } from './resident-lives.js';
import { doorRoute, type WaterfrontLot } from './harbor-streets.js';
import { shopperRounds, turnTicks, walkingPose, walkingTicks, type ShopFront, type ShopperGesture } from './shopper-rounds.js';

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

function shopperFigure(home:ResidentHome,redraw:()=>void) {
  const root=new T.Group();
  root.name=home.resident;root.visible=false;root.scale.setScalar(shopperScale);
  let disposed=false,model:GLTF|undefined,mixer:T.AnimationMixer|undefined;
  let walk:T.AnimationAction|undefined,turn:T.AnimationAction|undefined,active:T.AnimationAction|undefined;
  let head:T.Object3D|undefined,arm:T.Object3D|undefined,elbow:T.Object3D|undefined,bagArm:T.Object3D|undefined;
  const rest=[new T.Quaternion(),new T.Quaternion(),new T.Quaternion(),new T.Quaternion()];
  const note=new T.Mesh(new T.BoxGeometry(.12,.009,.085),new T.MeshStandardMaterial({color:0xf2ddaa,roughness:1}));
  note.name=home.life.tomas?'Nell’s recipe card':'Pocket notebook';note.visible=false;note.castShadow=note.receiveShadow=true;
  note.position.set(0,.245,.027);note.rotation.z=.21;
  let beat=-1;
  new GLTFLoader().load('/city/residents/market-shopper.glb?v=2',loaded=>{
    if(disposed){releaseShopper(loaded);return;}
    model=loaded;
    loaded.scene.traverse(part=>{
      if(!(part instanceof T.Mesh))return;
      part.castShadow=part.receiveShadow=true;
      for(const mat of Array.isArray(part.material)?part.material:[part.material]){
        if(mat instanceof T.MeshStandardMaterial && ['Sea glass','Deep harbor'].includes(mat.name))mat.color.setHex(home.life.tint);
      }
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
  });
  return {root,tint:home.life.tint,
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
      return true;
    },
    dispose(){
      disposed=true;
      note.removeFromParent();note.geometry.dispose();note.material.dispose();
      if(model){mixer?.stopAllAction();mixer?.uncacheRoot(model.scene);releaseShopper(model);}
    }
  };
}

function routeByDoor(lot:WaterfrontLot,street:T.Vector3[]) {
  const entrance=lot.gallery[0];
  if(!entrance || street.length<2)return;
  const {target}=doorRoute(entrance,street);
  const center=street.indexOf(target);
  const path=new T.CurvePath<T.Vector3>();
  const first=Math.max(0,center-3),last=Math.min(street.length-1,center+3);
  for(let i=first;i<last;i++)path.add(new T.LineCurve3(street[i]!,street[i+1]!));
  return path.getLength()>.05?path:undefined;
}

export function createHarborResidents(redraw:()=>void,clockSeconds:number,weekday:number) {
  const layer=new T.Group();layer.name='Harbor residents';
  const actors=new Map<string,ReturnType<typeof shopperFigure>>();
  let shadowDirty=false;
  type Route={home:ResidentHome;path:T.CurvePath<T.Vector3>;street:T.Vector3[];stops:string[];memory?:string;task:string;rounds?:ReturnType<typeof shopperRounds>};
  const routes=new Map<string,Route>();
  const position=new T.Vector3(),tangent=new T.Vector3(),behind=new T.Vector3();
  function place(homes:readonly ResidentHome[],lots:WaterfrontLot[],streets:Map<number,T.Vector3[][]>,fronts:ShopFront[],walkways:T.Vector3[][]){
    routes.clear();
    for(const actor of actors.values())actor.root.visible=false;
    for(const home of homes){
      const lot=lots.find(lot=>lot.site.id===home.site.id);
      const street=streets.get(home.site.bank)?.[home.site.lane];
      const path=lot && street && routeByDoor(lot,street);
      if(!path || !street)continue;
      const front=fronts.find(f=>f.site.id===home.site.id);
      const rounds=front?shopperRounds(front,fronts,walkways,weekday,home.life):undefined;
      const stops=rounds?.visits.flatMap(v=>v.site?[siteName(v.site.kind)+' · '+v.activity.task]:[])??[];
      const remembered=rounds?.visits.find(v=>v.site && v.memory);
      const memory=remembered?.site?'At '+siteName(remembered.site.kind).replace(/^The /,'the ')+', '+remembered.memory:undefined;
      routes.set(home.resident,{home,path,street,rounds,stops,memory,task:home.life.anchor.task});
      const existing=actors.get(home.resident);
      if(existing && existing.tint!==home.life.tint){existing.root.removeFromParent();existing.dispose();actors.delete(home.resident);}
      if(!actors.has(home.resident)){
        const actor=shopperFigure(home,()=>{shadowDirty=true;redraw();});
        actors.set(home.resident,actor);layer.add(actor.root);
      }
    }
    for(const [id,actor] of actors)if(!routes.has(id)){
      actor.root.removeFromParent();actor.dispose();actors.delete(id);
    }
    shadowDirty=true;
  }

  function sample(route:Route,seconds:number){
    return route.rounds?.sampleDay(clockSeconds+seconds)??{path:route.path,indoors:false,
      motion:residentMotion('shopper',seconds,route.path.getLength()),task:route.home.life.anchor.task};
  }
  function update(seconds:number,now:number){
    let changed=shadowDirty;shadowDirty=false;
    for(const [resident,route] of routes){
      const actor=actors.get(resident)!;
      const {path,motion,task,indoors}=sample(route,seconds),length=path.getLength();
      route.task=task;
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
  function visit(id:string):ResidentVisit|undefined{
    const route=routes.get(id);
    return route && {life:route.home.life,site:route.home.site,stops:route.stops,memory:route.memory,task:route.task};
  }
  return {layer,place,update,focus,positionOf,visit,dispose(){
    for(const actor of actors.values())actor.dispose();
    actors.clear();routes.clear();layer.clear();
  }};
}
