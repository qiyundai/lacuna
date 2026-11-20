import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { avatars, ground, landscape, model, plotPoints, route, trail, waypoint, workplace, type Library } from './landscape.js';
import { home, population, sites, workday, type Thought, type RiverClock, type Trade } from '../../../../shared/river.js';

export type TownData = {entries:Thought[];clock:RiverClock};
export type CameraAction = 'left'|'right'|'in'|'out'|'home';
export type Pick = (site:number, resident?:string)=>void;
const center = new T.Vector3(0,.4,0);

function batch(group:T.Group) {
  group.updateMatrixWorld(true);
  const instances=new Map<string,{mesh:T.Mesh;matrices:T.Matrix4[]}>();
  group.traverse(node=>{
    if(!(node instanceof T.Mesh) || Array.isArray(node.material))return;
    const key=node.geometry.uuid+node.material.uuid;
    const item=instances.get(key)??{mesh:node,matrices:new Array<T.Matrix4>()};
    item.matrices.push(node.matrixWorld.clone());instances.set(key,item);
  });
  const result=new T.Group();
  for(const {mesh,matrices} of instances.values()){
    const item=new T.InstancedMesh(mesh.geometry,mesh.material,matrices.length);
    matrices.forEach((matrix,i)=>item.setMatrixAt(i,matrix));
    item.castShadow=mesh.castShadow;item.receiveShadow=mesh.receiveShadow;result.add(item);
  }
  return result;
}
export function createScene(canvas:HTMLCanvasElement,library:Library,pick:Pick){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFShadowMap;
  const scene=new T.Scene();
  scene.background=new T.Color('#e5eadd');
  scene.fog=new T.FogExp2('#e5eadd',.006);
  const floor=new T.Mesh(new T.PlaneGeometry(800,800),new T.ShadowMaterial({color:'#64785c',opacity:.22}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-1.94;floor.receiveShadow=true;scene.add(floor);
  scene.add(new T.HemisphereLight(0xfff8ea,0xb2bda1,1.85));
  const sun=new T.DirectionalLight(0xffe8c1,2.05);
  sun.position.set(-13,24,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-24,right:24,top:22,bottom:-22,far:80});
  sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;scene.add(sun);
  const camera=new T.OrthographicCamera(-20,20,17,-17,.1,180);
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=false;controls.screenSpacePanning=false;controls.minZoom=.65;controls.maxZoom=4.2;
  controls.minPolarAngle=.15;controls.maxPolarAngle=Math.PI*.43;controls.rotateSpeed=.65;
  const back=()=>{controls.target.copy(center);camera.position.set(19,26,32);camera.zoom=1;camera.updateProjectionMatrix();controls.update();};
  back();
  const fixed=batch(landscape(library));scene.add(fixed);
  let built=new T.Group();scene.add(built);
  const marker=new T.Mesh(new T.RingGeometry(1.65,1.75,64),new T.MeshBasicMaterial({color:'#fff7bd',side:T.DoubleSide,depthWrite:false}));
  marker.rotation.x=-Math.PI/2;marker.visible=false;scene.add(marker);
  const folk=new Map<string,{object:T.Object3D;mixer:T.AnimationMixer;site:number;journey:T.CurvePath<T.Vector3>;phase:number;trade:Trade}>();
  const hit=new T.Raycaster(), pointer=new T.Vector2();
  let follow='', selectedResident='', focused=-1, elapsed=0, frame=0,lastFrame=0, lastUpdate=0;
  let currentData:TownData|null=null;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const ownedGeometry=new Set<T.BufferGeometry>(),ownedMaterials=new Set<T.Material>(),textures=new Set<T.Texture>();
  function collect(object:T.Object3D){
    object.traverse(node=>{
      if(!(node instanceof T.Mesh))return;
      ownedGeometry.add(node.geometry);
      for(const mat of Array.isArray(node.material)?node.material:[node.material]){ownedMaterials.add(mat);if(mat.map)textures.add(mat.map);}
    });
  }
  library.forEach(asset=>collect(asset.scene));collect(fixed);collect(floor);collect(marker);
  let disposablePaths:T.Mesh[]=[];
  function clearBuildings(){
    scene.remove(built);
    built.traverse(n=>{if(n instanceof T.InstancedMesh)n.dispose();});
    for(const mesh of disposablePaths){mesh.geometry.dispose();(mesh.material as T.Material).dispose();}
    disposablePaths=[];
  }
  function itinerary(site:number,trade:Trade,moving:boolean,origin:number,house?:[number,number]){
    const path=route(site);
    if(house){
      path.splice(0,path.length,waypoint(house[0],house[1]+1.4),waypoint(house[0]*.67,house[1]*.6+1),path[0]);
    }else if(trade==='carrier' && moving){
      path.push(new T.Vector3(0,.60,0),...route(origin).reverse());
    }else if(trade==='carrier'){
      path.splice(1);path.push(path[0].clone().add(new T.Vector3(.65,0,.2)));
    }
    const trip=new T.CurvePath<T.Vector3>();
    for(let i=1;i<path.length;i++)trip.add(new T.LineCurve3(path[i-1],path[i]));
    return trip;
  }
  function update(data:TownData){
    currentData=data;
    clearBuildings();
    const lots=population(data.entries), flow=workday(lots,data.clock.grain),buildings=new T.Group();
    lots.forEach(({trade,workers},i)=>{
      if(!trade)return;
      buildings.add(workplace(library,i,trade,workers));
      const path=trail(route(i),.32+Math.min(1,data.clock.traffic[i]/28)*.65,'#c6b284');
      disposablePaths.push(path);buildings.add(path);
    });
    built=batch(buildings);scene.add(built);
    const visible=data.entries.slice(-48);
    const selectedEntry=data.entries.find(entry=>entry.id===selectedResident);
    if(selectedEntry&&!visible.includes(selectedEntry))visible[0]=selectedEntry;
    const cast = visible.map(entry=>({id:entry.id,...home(entry)}));
    for(let i=0;i<12;i++){
      const site=i<5?i%2:2;
      cast.push({id:'founder-'+i,site,trade:sites[site].trade!});
    }
    const ids=new Set(cast.map(r=>r.id));
    for(const [id,actor] of folk)if(!ids.has(id)){
      actor.mixer.stopAllAction();scene.remove(actor.object);folk.delete(id);
    }
    cast.forEach(({id,site,trade},i)=>{
      const bank=sites[site].bank;
      const shipping=flow.mealsMoved[bank]+flow.grainMoved[bank];
      const supply=flow.grainMoved[bank]?'grower':'cook';
      const source=lots.findIndex((lot,j)=>lot.trade===supply && sites[j].bank!==bank);
      const founder=id.startsWith('founder-')?Number(id.slice(8)):-1;
      const addresses:[number,number][]=[[-9,-6],[-12,-3],[-6,-8],[-11,2],[8,-8],[11,-6.6],[12,2.5],[6,7.7]];
      const house=founder>=2&&founder!==5?addresses[founder<5?founder-2:4+(founder-6)%4]:undefined;
      const journey=itinerary(site,trade,shipping>0,source>=0?source:(bank?0:2),house);
      const existing=folk.get(id);
      if(existing){existing.journey=journey;return;}
      const asset=library.get(avatars[trade])!,object=clone(asset.scene);
      object.scale.setScalar(.89);
      if(trade==='carrier'&&!house){
        const cart=model(library,'cart',0,.01,-.55,.48);
        object.add(cart);
      }
      object.userData={resident:id,site};
      const mixer=new T.AnimationMixer(object);
      const clip=asset.animations.find(a=>a.name===(reduce.matches?'idle':'walk'));
      if(clip)mixer.clipAction(clip).play();
      scene.add(object);folk.set(id,{object,mixer,site,journey,trade,phase:(i*.381966+.09)%1});
    });
    render(0);lastUpdate=0;
  }
  function select(site:number,id=''){
    focused=site;selectedResident=id;follow='';
    if(id && !folk.has(id) && currentData?.entries.some(entry=>entry.id===id))update(currentData);
    marker.visible=site>=0;
    if(site>=0){const p=plotPoints[site];marker.position.set(p.x,ground(p.x,p.z)+.14,p.z);}
  }
  function focus(){
    if(focused<0)return;
    follow=folk.has(selectedResident)?selectedResident:'';
    const target=folk.get(follow)?.object.position??plotPoints[focused];
    camera.position.add(target.clone().sub(controls.target));controls.target.copy(target);
    camera.zoom=Math.max(1.9,camera.zoom);camera.updateProjectionMatrix();controls.update();
  }
  function action(command:CameraAction){
    follow='';
    if(command==='home')back();
    else if(command==='left'||command==='right')controls.rotateLeft(command==='left'?.28:-.28);
    else {camera.zoom=T.MathUtils.clamp(camera.zoom*(command==='in'?1.24:1/1.24),controls.minZoom,controls.maxZoom);camera.updateProjectionMatrix();}
    controls.update();render(0);
  }
  function render(dt:number){
    elapsed+=dt;
    for(const actor of folk.values()){
      const distance=actor.journey.getLength();
      const phase=(actor.phase+(reduce.matches?0:elapsed*.63/Math.max(1,distance*2)))%1;
      const u=Math.min(.999,Math.max(.001,phase<.5?phase*2:2-phase*2));
      const position=actor.journey.getPointAt(u),direction=actor.journey.getTangentAt(u);
      const sign=phase<.5?1:-1;
      position.x+=direction.z*(actor.phase-.5)*.56;
      position.z-=direction.x*(actor.phase-.5)*.56;
      actor.object.position.copy(position);actor.object.rotation.y=Math.atan2(sign*direction.x,sign*direction.z);
      if(!reduce.matches)actor.mixer.update(dt);
    }
    const followed=folk.get(follow);
    if(followed){
      const target=followed.object.position;
      camera.position.add(target.clone().sub(controls.target));controls.target.copy(target);
    }
    controls.update();renderer.render(scene,camera);
  }
  function loop(now:number){
    frame=requestAnimationFrame(loop);
    if(now-lastUpdate<33)return;
    const dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):0;
    lastFrame=lastUpdate=now;render(dt);
  }
  function visibility(){
    cancelAnimationFrame(frame);lastFrame=0;
    if(!document.hidden)frame=requestAnimationFrame(loop);
  }
  const resize=new ResizeObserver(()=>{
    const {width,height}=canvas.getBoundingClientRect();if(!width||!height)return;
    const aspect=width/height, half=Math.max(12.6,20.5/aspect);
    camera.top=half;camera.bottom=-half;camera.left=-half*aspect;camera.right=half*aspect;
    camera.updateProjectionMatrix();renderer.setSize(width,height,false);render(0);
  });
  let start:T.Vector2|null=null;
  const down=(e:PointerEvent)=>{start=e.isPrimary && e.button===0?new T.Vector2(e.clientX,e.clientY):null;};
  const up=(e:PointerEvent)=>{
    if(!start||start.distanceTo(new T.Vector2(e.clientX,e.clientY))>5)return;
    start=null;
    const rect=canvas.getBoundingClientRect();
    pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
    hit.setFromCamera(pointer,camera);
    const nearest=hit.intersectObjects([built,fixed,...Array.from(folk.values(),f=>f.object)],true)[0];
    if(!nearest)return;
    for(let object:T.Object3D|null=nearest.object;object;object=object.parent){
      if(object.userData.resident){pick(object.userData.site,object.userData.resident);return;}
    }
    const distances=plotPoints.map(p=>Math.hypot(p.x-nearest.point.x,p.z-nearest.point.z));
    const best=Math.min(...distances);if(best<2.4)pick(distances.indexOf(best));
  };
  const key=(e:KeyboardEvent)=>{
    const commands:Record<string,CameraAction>={q:'left',e:'right','+':'in','=':'in','-':'out',Home:'home'};
    if(commands[e.key]){e.preventDefault();action(commands[e.key]);}
    else if(e.key.startsWith('Arrow')){e.preventDefault();follow='';controls.pan(e.key==='ArrowLeft'?50:e.key==='ArrowRight'?-50:0,e.key==='ArrowUp'?50:e.key==='ArrowDown'?-50:0);controls.update();}
  };
  controls.addEventListener('start',()=>{follow='';});
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);canvas.addEventListener('keydown',key);
  document.addEventListener('visibilitychange',visibility);resize.observe(canvas);visibility();
  return {update,select,focus,action,destroy(){
    cancelAnimationFrame(frame);resize.disconnect();document.removeEventListener('visibilitychange',visibility);
    canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('keydown',key);
    controls.dispose();clearBuildings();fixed.traverse(n=>{if(n instanceof T.InstancedMesh)n.dispose();});
    folk.forEach(f=>{f.mixer.stopAllAction();f.mixer.uncacheRoot(f.object);});folk.clear();
    ownedGeometry.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();
  }};
}
