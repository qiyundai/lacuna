import {lightAt,localHour,meteorClock,onLocalMinute} from './city-clock.js';
import {floorSeed,roomLighting,type WindowEmitter} from './room-light.js';
import { batchPlantings } from './tree-batches.js';
import type { WoodlandTree } from './woodland-boughs.js';
import { groveCell } from './corridor-vegetation.js';
import { constrainValleyView } from './valley-camera.js';
import * as T from 'three';
import { cityPageMarkers, type CityParcel, type PageMarker } from './city-page-markers.js';
import { valleyInput } from './valley-input.js';
import { createGreenCorridor } from './green-corridor.js';
import { bankEdge, inValley, valleyOrigin,riverWidth } from './valley-river.js';
import { createBayWater } from './bay-water.js';
import { createBayAtmosphere } from './bay-atmosphere.js';
import { harborWorkshop, landHeight, shoreline, siteHeading, sitePoint, mooring, isWorkplace, type Workshop } from './harbor-workshop.js';
import { isRiverVenue } from './architecture-catalog.js';
import { buildingArrival } from './building-arrival.js';
import { bridgeApproach, pavedRun, railClearance, doorRoute, connectDoors, hillsidePassage, neighborhoodPassages, placeLot, streetFurniture, streetLine, streetSide, streetWidth } from './harbor-streets.js';
import { courtTemplates, cutBuildingPlots, gardenClearance, landscapeWaterfront, loadGardenPlants } from './waterfront-gardens.js';
import { createBayWorld } from './bay-world.js';
import { createHarborResidents } from './harbor-residents.js';
import type { ResidentHome, ResidentVisit } from './resident-lives.js';
import type { ShopFront } from './shopper-rounds.js';
import { hashPage } from './city-growth.js';
import { footbridge } from './footbridge.js';
import { canalTunnel } from './canal-tunnel.js';
import { bridgeStation } from './river-passage.js';
import { FerryCourse } from './ferry-course.js';
import { createValleySound, type SoundPlace } from './valley-sound.js';
import type { Coast, Site } from './painted-coast.js';
import type { CityDetails } from './journal-details.js';
import { furnishAddress, loadJournalFurniture } from './journal-furnishings.js';
import { createMeadow, groveDensity, plantGroves } from './waterfront-meadow.js';

function bake(source:T.Object3D,plant:(trees:WoodlandTree[],rotation:number)=>T.Group,rooms?:ReturnType<typeof roomLighting>){
  source.updateMatrixWorld(true);
  const parts=new Map<T.BufferGeometry,Map<T.Material,T.Matrix4[]>>();
  const trees:WoodlandTree[]=[];
  const seeds=new Map<T.Matrix4,T.Color>();
  function collect(o:T.Object3D,address=0,workplace=false,rootInverse?:T.Matrix4,quiet=false){
    if(o.userData.addressSeed!==undefined){
      address=o.userData.addressSeed;workplace=!!o.userData.workplace;quiet=!!o.userData.quiet;
      rootInverse=o.matrixWorld.clone().invert();
    }
    const species=o.userData.treeSpecies;
    if(typeof species==='number'){
      const e=o.matrixWorld.elements,x=e[12]!,y=e[13]!,z=e[14]!;
      const size=Math.hypot(e[4]!,e[5]!,e[6]!);
      trees.push({ix:Math.floor(x/groveCell),iz:Math.floor(z/groveCell),x,y,z,size,
        species,yaw:Math.atan2(e[8]!,e[10]!),spread:Math.hypot(e[0]!,e[1]!,e[2]!)/size});
      return;
    }
    if(o instanceof T.Mesh && !Array.isArray(o.material)){
      const bySkin=parts.get(o.geometry)??new Map<T.Material,T.Matrix4[]>();
      const matrix=o.matrixWorld.clone();
      const finish=o.geometry.userData.glassFinish;
      let material=o.material;
      if(rooms && !quiet && (finish || material===rooms.proxy)){
        const seed=floorSeed(address,rootInverse?new T.Matrix4().multiplyMatrices(rootInverse,matrix):matrix);
        seeds.set(matrix,new T.Color(seed,Number(workplace),1));
        if(finish){
          material=finish==='crystal'?rooms.crystal:rooms.glazing;
          const transform=new T.Matrix4().makeRotationY(Math.PI/2).setPosition(valleyOrigin.x,0,valleyOrigin.z).multiply(matrix);
          const used=new Set<number>();
          for(const pane of o.geometry.userData.emitters as WindowEmitter[]){
            if(used.has(pane.threshold))continue;
            used.add(pane.threshold);
            rooms.sources.push({address,workplace,threshold:(pane.threshold+seed)%1,
              center:pane.center.clone().applyMatrix4(transform),normal:pane.normal.clone().transformDirection(transform)});
          }
        }
      }
      const list=bySkin.get(material)??[];list.push(matrix);
      bySkin.set(material,list);parts.set(o.geometry,bySkin);
    }
    for(const child of o.children)collect(child,address,workplace,rootInverse,quiet);
  }
  collect(source);
  const result=plant(trees,Math.PI/2);
  for(const [geometry,bySkin] of parts)for(const [material,instances] of bySkin){
    const batch=batchPlantings(geometry,material,instances,seeds.has(instances[0]!)?instances.map(m=>seeds.get(m)!):undefined);
    if(material===rooms?.glazing)batch.castShadow=false;
    result.add(batch);
  }
  return result;
}
function releaseInstances(group:T.Object3D){
  group.traverse(o=>{
    if(o instanceof T.InstancedMesh)o.dispose();
    else if(o instanceof T.Mesh && o.geometry instanceof T.InstancedBufferGeometry)o.geometry.dispose();
  });group.clear();
}
const shoreRows=181;
function meadowSurface(left:number,right:number){
  const positions:number[]=[],indices:number[]=[],habitat:number[]=[];
  const cols=Math.ceil(right-left+56);
  for(let i=0;i<=cols;i++){
    const x=left-28+i,edge=shoreline(x);
    for(let j=0;j<shoreRows;j++){
      const depth=T.MathUtils.lerp(-riverWidth(x)-44,86,j/(shoreRows-1)),z=edge-depth;
      positions.push(x,landHeight(x,z),z);habitat.push(groveDensity(x,z)*T.MathUtils.smoothstep(depth,27,35));
      if(i<cols&&j+1<shoreRows){const k=i*shoreRows+j;indices.push(k,k+shoreRows,k+1,k+shoreRows,k+shoreRows+1,k+1);}
    }
  }
  const g=new T.BufferGeometry();g.setIndex(indices);g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('habitat',new T.Float32BufferAttribute(habitat,1));g.computeVertexNormals();return g;
}
function streetDeck(shop:Workshop,points:T.Vector3[]){
  const p:number[]=[],uv:number[]=[],indices:number[]=[],pavement:number[]=[];
  let length=0;
  for(let i=0;i<points.length;i++){
    const here=points[i]!,before=points[Math.max(0,i-1)]!,side=streetSide(points,i);
    length+=before.distanceTo(here);
    const corners:T.Vector3[]=[];
    for(const sign of [-1,1]){
      const x=here.x+sign*side.x,z=here.z+sign*side.y;
      const ground=landHeight(x,z);
      const span=(i%6)/3-1;
      const soffit=here.y-.32-.85*(1-Math.sqrt(Math.max(0,1-span*span)));
      const bottom=ground<.3?Math.max(soffit,ground-.18):Math.min(here.y-.19,ground-.22);
      corners.push(new T.Vector3(x,bottom,z),new T.Vector3(x,here.y,z));
    }
    for(const [l,r] of [[0,1],[1,3],[3,2],[2,0]] as const){
      const start=p.length/3;
      for(const j of [l,r]){
        const v=corners[j]!;
        p.push(v.x,v.y,v.z);
        uv.push(length*.48,((j>=2?streetWidth:0)+v.y-here.y)*.5);
      }
      if(i)(l===1?pavement:indices).push(start-8,start-7,start,start-7,start+1,start);
    }
    if(i===0 || i===points.length-1){
      const offset=points.length*8;
      const start=i===0?offset:offset+4;
      for (const j of (i===0?[0,2,1,2,3,1]:[0,1,2,2,1,3])) indices.push(start+j);
    }
  }
  for(const index of [0,points.length-1]){
    const section=index*8;
    for(const corner of [0,1,5,4]){
      const j=section+corner;
      p.push(p[j*3]!,p[j*3+1]!,p[j*3+2]!);
      uv.push(uv[j*2]!,uv[j*2+1]!);
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices.concat(pavement));g.computeVertexNormals();
  g.addGroup(0,indices.length,0);g.addGroup(indices.length,pavement.length,1);
  const mesh=new T.Mesh(g,[shop.materials.ashlar,shop.materials.gravel]);mesh.receiveShadow=true;mesh.castShadow=true;return mesh;
}
export type ValleyView='City'|'Overlook';
export async function createHarbor(canvas:HTMLCanvasElement,onPage?:(id:string)=>void,afterglow=false,onMarkers?:(markers:PageMarker[])=>void,fixedHour?:number,onResident?:(visit?:ResidentVisit)=>void,onMeet?:(id:string)=>void){
  const wind={value:0};
  const [shop,gardens,furniture]=await Promise.all([harborWorkshop(wind),loadGardenPlants(wind),loadJournalFurniture(wind)]);
  const courts=courtTemplates(shop,gardens.props);
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  const scene=new T.Scene();
  const rooms=roomLighting(),meteor=meteorClock(),look=new T.Vector3(),meteorRay=new T.Vector3();
  let hour=fixedHour??localHour(),light=lightAt(hour),clockCheck=-Infinity;
  const dayFog=new T.Color('#66827f'),nightFog=new T.Color('#38384f'),duskFog=new T.Color('#a77c88');
  const world=createBayWorld(scene,afterglow);
  const valley=await createGreenCorridor(shop.materials.heath.map!,shop.treeModels,world.lighting,shop.paint,afterglow);
  renderer.localClippingEnabled=true;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  const camera=new T.PerspectiveCamera(47,1,.30,valley.far);
  scene.fog=new T.FogExp2('#66827f',.00014);
  const sea=createBayWater(world.sunDirection,world.sun,renderer.extensions.has('EXT_color_buffer_float'),afterglow,world.daylight),water=sea.water;
  const atmosphere=createBayAtmosphere(renderer,scene,camera,world.sun,world.sunDirection,valley.mist,afterglow,world.daylight);
  scene.add(water,valley.root);
  const city=new T.Group();city.position.set(valleyOrigin.x,0,valleyOrigin.z);city.rotation.y=Math.PI/2;scene.add(city);
  const localEye=new T.Vector3();
  const target=new T.Vector3();
  const scenery=new T.Group(),structures=new T.Group(),paths=new T.Group(),travel=new T.Group();
  city.add(scenery,structures,paths,travel);
  const residents=createHarborResidents(schedule,new Date().getDay());
  function routineTime(){
    if(fixedHour!==undefined)return fixedHour*3600+time;
    const now=new Date();
    return localHour(now)*3600+now.getMilliseconds()/1000;
  }
  city.add(residents.layer);
  let homes:ResidentHome[]=[];
  const residentRay=new T.Raycaster();
  const residentFrustum=new T.Frustum(),residentProjection=new T.Matrix4();
  const bore=canalTunnel(shop);
  const tunnel=bake(bore.group,valley.plant);city.add(tunnel);
  const vessel=shop.ferry();
  const fleet=sea.wakes.map(wake=>{
    const boat=bake(vessel,valley.plant);boat.traverse(part=>{part.castShadow=false;});travel.add(boat);
    return {boat,wake,course:undefined as FerryCourse|undefined,route:'',phase:0};
  });
  const soundFerries=fleet.map(()=>({position:new T.Vector3(),visible:false,speed:0}));
  const soundPlaces:SoundPlace[]=[];
  let sound:ReturnType<typeof createValleySound>|undefined;
  let audioContext:AudioContext|undefined, soundEnabled=false, pageOpen=false;
  const beamGeometry=new T.CylinderGeometry(.028,.91,17,24,1,true);
  beamGeometry.rotateZ(Math.PI/2);beamGeometry.translate(8.5,0,0);
  const beamMaterial=new T.ShaderMaterial({uniforms:{strength:{value:0}},transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
    vertexShader:'varying float along;void main(){along=position.x/17.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float strength;varying float along;void main(){gl_FragColor=vec4(1.,.77,.42,strength*.061*pow(max(0.,1.-along),1.8));}'});
  const beam=new T.Mesh(beamGeometry,beamMaterial);beam.renderOrder=2;travel.add(beam);
  const signals=new AbortController(),options={signal:signals.signal};
  type HarborPlan = Coast & {details?: CityDetails; homes?:ResidentHome[]};
  let rangeKey='',plan:HarborPlan={sites:[],addresses:new Map(),rooms:new Map(),neighborhoods:new Map(),ports:[],service:0,start:0,end:1800};
  let bridge:ReturnType<typeof footbridge>|undefined;
  let meadow:ReturnType<typeof createMeadow>|undefined;
  const glows=new T.Points(new T.BufferGeometry(),new T.ShaderMaterial({
    uniforms:{screen:{value:500},strength:{value:0}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:'uniform float screen;attribute float radius;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(radius*screen/max(1.,-p.z),2.,76.);}',
    fragmentShader:'uniform float strength;void main(){float r=length(gl_PointCoord-.5)*2.;float a=exp(-5.6*r*r)*(1.-smoothstep(.76,1.,r));gl_FragColor=vec4(1.,.54,.22,a*.40*strength);}'
  }));glows.renderOrder=2;city.add(glows);
  const roomHighlight=new T.Points(new T.BufferGeometry(),glows.material.clone());
  roomHighlight.geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0],3));
  roomHighlight.geometry.setAttribute('radius',new T.Float32BufferAttribute([1.6],1));
  roomHighlight.material.uniforms.screen=glows.material.uniforms.screen!;
  roomHighlight.renderOrder=3;
  roomHighlight.visible=false;
  city.add(roomHighlight);
  let roomAge=0;
  const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,paused=false,skipped=false,dead=false,last=0,time=afterglow?133:0,framed=false,inspected=false;
  let lastShadowTime = -Infinity;
  const shadowEye=new T.Vector3(Infinity,0,0);
  let focusX=0,loadedInlet=0;
  let construction: {arrival:ReturnType<typeof buildingArrival>; start:number; site:Site} | undefined;
  let framing: {from:T.Vector3; to:T.Vector3; eye:T.Vector3; end:T.Vector3; start:number} | undefined;
  let beamReady=false;
  let selectedPage:string|undefined;
  let residentLook:T.Vector3|undefined;
  let following:string|undefined,lastVisit:ResidentVisit|undefined;
  const followOffset=new T.Vector3(),followPoint=new T.Vector3();
  function leaveResident(){
    residentLook=undefined;following=undefined;
    if(lastVisit){lastVisit=undefined;onResident?.();}
  }
  const parcels:CityParcel[]=[];
  const pageTargets=cityPageMarkers(canvas,camera,city,parcels,markers=>onMarkers?.(markers));
  const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
  const detailViews = new Map<string, {target:T.Vector3;eye:T.Vector3}>();
  function cityPose(station:number){
    const visible=plan.sites.map(sitePoint).filter(p=>Math.abs(p.x-station)<90);
    const district=new T.Box3().setFromPoints(visible);
    const center=visible.length?district.getCenter(new T.Vector3()):v(station,3,shoreline(station)-15);
    const base=inValley(center),size=district.getSize(new T.Vector3());
    const reach=T.MathUtils.clamp(36+size.x*.73+size.z*.76/Math.max(.52,camera.aspect),36,158);
    const facing=station>145?-1:1;
    return {target:base.clone().add(v(0,3+reach*.14,-4*facing)),eye:base.clone().add(v(.24,.36,facing).multiplyScalar(reach))};
  }
  function visit(view:ValleyView|'Page',id?:string){
    pageTargets.invalidate();
    const site=id?plan.addresses.get(id):undefined;
    if(site && Math.abs(Math.floor(site.x/1800)-loadedInlet)>1)update(plan,undefined,Math.floor(site.x/1800));
    const detail = id && detailViews.get(id);
    const p=site?inValley(sitePoint(site)):undefined;
    const pose=view==='Overlook'?{eye:v(70,165,493),target:v(73,132,263)}:
      detail || (p?{eye:p.clone().add(v(11,8,13)),target:p.clone().add(v(0,2,0))}:cityPose(plan.latest?sitePoint(plan.latest).x:0));
    selectedPage=id;
    inspected=true;moveTo(pose,true);
  }
  function visitResident(id:string){
    const home=homes.find(h=>h.resident===id && h.arrival<=Date.now()/1000);
    if(!home)return;
    const inlet=Math.floor(home.site.x/1800);
    if(Math.abs(inlet-loadedInlet)>1)update(plan,undefined,inlet);
    const seconds=routineTime(),pose=residents.focus(home.resident,seconds);
    if(!pose)return {life:home.life,site:home.site,stops:[],task:home.life.anchor.task};
    inspected=true;selectedPage=undefined;
    const subject=inValley(pose.point.add(v(0,.80,0)));
    moveTo({target:subject,eye:inValley(pose.eye)},true);
    residentLook=subject;
    following=home.resident;
    followOffset.copy(inValley(pose.eye)).sub(subject);
    return residents.visit(id,seconds);
  }
  function moveTo(pose:{eye:T.Vector3;target:T.Vector3},glide:boolean){
    leaveResident();
    input.reset();
    if(glide&&!paused&&!motionPreference.matches)framing={from:target.clone(),to:pose.target,eye:camera.position.clone(),end:pose.eye,start:performance.now()};
    else{framing=undefined;target.copy(pose.target);camera.position.copy(pose.eye);}
    schedule();
  }
  const checkedEye=new T.Vector3(Infinity,0,0),checkedTarget=new T.Vector3();
  function constrainCamera(){
    if(checkedEye.equals(camera.position)&&checkedTarget.equals(target))return;
    const halfHeight=camera.near*Math.tan(T.MathUtils.degToRad(camera.fov)*.5);
    const clearanceRadius=Math.hypot(camera.near,halfHeight,halfHeight*camera.aspect);
    const upstream=valleyOrigin.z-(plan.end-900)/12.5;
    constrainValleyView(camera.position,target,valley.bounds,upstream,valley.ground,clearanceRadius);
    camera.lookAt(residentLook && !framing?residentLook:target);camera.updateMatrixWorld();
    checkedEye.copy(camera.position);checkedTarget.copy(target);
  }
  function schedule(){if(!frame&&!dead&&!document.hidden&&!skipped)frame=requestAnimationFrame(draw);}
  function draw(now:number){
    frame=0;if(dead||document.hidden||skipped)return;
    if(!paused&&!framing&&!input.active()&&last&&now-last<30){schedule();return;}
    const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(!paused)time+=dt;
    input.step(now);
    if (framing) {
      const t=paused?1:T.MathUtils.smootherstep((now-framing.start)/1250,0,1);
      target.lerpVectors(framing.from,framing.to,t);
      camera.position.lerpVectors(framing.eye,framing.end,t);
      if (t===1) framing=undefined;
    }
    if(following && !framing && residentLook){
      const p=residents.positionOf(following);
      if(p){
        inValley(p,followPoint);followPoint.y+=.80;
        residentLook.lerp(followPoint,1-Math.exp(-8*dt));
        target.copy(residentLook);camera.position.copy(target).add(followOffset);
      }
    }
    constrainCamera();
    const centerInlet=T.MathUtils.clamp(Math.floor((valleyOrigin.z-target.z+72)/144),plan.start/1800,plan.end/1800-1);
    if(inspected&&!framing&&centerInlet!==loadedInlet)update(plan,undefined,centerInlet);
    if(roomHighlight.visible && !framing){
      roomAge+=dt;
      const progress=paused||motionPreference.matches?1:Math.min(1,roomAge/.9);
      roomHighlight.material.uniforms.strength!.value=2.7*(1-T.MathUtils.smoothstep(progress,.14,1))*T.MathUtils.smoothstep(progress,0,.14);
      roomHighlight.visible=progress<1;
    }
    if (construction) {
      const progress=paused||motionPreference.matches?1:Math.min(1,(time-construction.start)/1.85);
      construction.arrival.sample(progress);
      if (progress===1) {
        construction.arrival.finish();
        if(construction.site.kind!=='pines')sound?.settle(inValley(sitePoint(construction.site)));
        construction=undefined;
        atmosphere.invalidateRooms();
      }
      if (!construction || time-lastShadowTime>.10) {
        renderer.shadowMap.needsUpdate=true;
        lastShadowTime=time;
      }
    }
    beam.rotation.y=-Math.PI*.5+Math.sin(time*.18)*1.20;
    for(const [i,{boat,course,phase,wake}] of fleet.entries()){
      boat.visible=!!course;
      const audible=soundFerries[i]!;
      audible.visible=false;
      const hull=sea.hulls[i]!;
      if(!course){hull.set(0,0,0,0);continue;}
      const {progress,direction,visible,speed}=course.sample(time+phase);
      boat.visible=visible;
      course.getPointAt(progress,boat.position);
      boat.position.y+=.027*Math.sin(time*1.05);
      const tangent=course.getTangentAt(progress).multiplyScalar(direction);
      boat.rotation.y=-Math.atan2(tangent.z,tangent.x);
      inValley(boat.position,audible.position);
      audible.visible=visible;audible.speed=speed;
      hull.set(audible.position.x,audible.position.z,visible?tangent.z:0,visible?-tangent.x:0);
      wake.sample(boat.position,tangent,time,boat.visible);
      sea.wakeCounts[i]=wake.count.value;
    }
    if(now-clockCheck>=1000){
      clockCheck=now;
      const nextHour=fixedHour??localHour();
      if(hour!==nextHour){
        if(Math.abs(nextHour-hour)>1/120 || paused){water.forceUpdate=true;renderer.shadowMap.needsUpdate=true;}
        hour=nextHour;light=lightAt(hour);
      }
    }
    applyLight();
    const night=light.daylight<.22;
    let skyInView=false,altitude=0;
    if(night && !paused && !motionPreference.matches){
      camera.getWorldDirection(look);
      altitude=T.MathUtils.clamp(Math.asin(look.y)+T.MathUtils.degToRad(camera.fov)*.34,.13,.85);
      meteorRay.set(0,Math.sin(altitude),Math.sign(look.z)*Math.cos(altitude))
        .multiplyScalar(400).add(camera.position).project(camera);
      skyInView=Math.abs(meteorRay.x)<.88 && Math.abs(meteorRay.y)<.91 && meteorRay.z<1;
    }
    const age=meteor(dt,night,!paused&&!motionPreference.matches,skyInView);
    world.meteorAge.value=age;
    if(age===0){
      const radius=Math.cos(altitude)/(1+Math.sin(altitude));
      world.meteorStart.set((Math.random()-.5)*.021,Math.sign(look.z)*radius);
    }
    if (time - lastShadowTime >= 3 || shadowEye.distanceToSquared(camera.position)>2.25) {
      renderer.shadowMap.needsUpdate = true;
      lastShadowTime = time;
    }
    if(renderer.shadowMap.needsUpdate)shadowEye.copy(camera.position);
    water.position.x=camera.position.x;
    water.position.z=camera.position.z;
    shop.breezeTime.value=motionPreference.matches?0:time;
    city.worldToLocal(localEye.copy(camera.position));meadow?.view();
    residentProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(city.matrixWorld);
    residentFrustum.setFromProjectionMatrix(residentProjection);
    if(residents.update(routineTime(),Date.now()/1000,localEye,residentFrustum,following))renderer.shadowMap.needsUpdate=true;
    const visit=following?residents.visit(following):undefined;
    if(visit?.life!==lastVisit?.life || visit?.task!==lastVisit?.task || visit?.stops!==lastVisit?.stops){
      lastVisit=visit;onResident?.(visit);
    }
    valley.tick(time,camera.position,shop.breezeTime.value);sea.clock.value=time;atmosphere.render(time,rooms.sources,light,construction?hashPage(construction.site.id):undefined);
    sound?.update(camera,light.daylight,paused,soundPlaces,soundFerries,valley.flocks,valley.ground,valley.coverAt);
    const selected=selectedPage?plan.addresses.get(selectedPage):undefined;
    if(onMarkers)pageTargets.update(selected??plan.latest,selected?selectedPage:undefined);
    if(!paused||framing||input.active())schedule();
  }
  function applyLight(){
    world.setTime(time,valleyOrigin.x+shoreline(focusX)-15,camera.position.x,valleyOrigin.z-focusX,light,motionPreference.matches?0:time);
    rooms.apply(light);shop.fixtures.apply(light);
    shop.clockHour.value=Math.floor(hour*60+.000001)/60;
    (scene.fog as T.FogExp2).color.copy(nightFog).lerp(dayFog,light.daylight).lerp(duskFog,light.twilight*.68);
    shop.materials.lamp.emissiveIntensity=2.2*(1-light.daylight);
    glows.material.uniforms.strength!.value=1-light.daylight;
    glows.visible=light.daylight<.999 && (glows.geometry.getAttribute('position')?.count??0)>0;
    beam.visible=beamReady && light.daylight<.99 && construction?.site.kind!=='beacon';
    beamMaterial.uniforms.strength!.value=1-light.daylight;
  }
  function fit(glide=false){
    moveTo(cityPose(focusX),glide);
  }
  function refreshTerrain(start:number,end:number){
    const left=(start-900)/12.5,right=(end-900)/12.5,key=left+','+right;
    valley.followRiver(left,right,plan.end*.08);
    if(camera.far!==valley.far){camera.far=valley.far;camera.updateProjectionMatrix();}
    if(rangeKey===key)return;rangeKey=key;sea.bounds.set(left,right);
    if(meadow){city.remove(meadow.group);meadow.dispose();}
    releaseInstances(scenery);
    const surface=meadowSurface(left,right);
    meadow=createMeadow(surface,shoreRows,localEye,shop.materials.heath.map!,shop.breezeTime);
    city.add(meadow.group);surface.dispose();
    const woods=new T.Group();
    plantGroves(left,right,shoreline,landHeight,(x,y,z,h,seed)=>shop.tree(woods,x,y,z,h,seed));
    plantGroves(left,right,x=>-bankEdge(x,1)-10,(x,z)=>landHeight(x,-z),(x,y,z,h,seed)=>shop.tree(woods,x,y,-z,h,seed));
    scenery.add(bake(woods,valley.plant));
  }
  function sailings(start:number,end:number){
    const wharves=plan.ports.filter(site=>site.x>=start&&site.x<end);
    const crossing=bridgeStation(plan.sites);
    const current=fleet[1]?.course?.berth;
    const stop=wharves.find(site=>current&&mooring(site).station===current.station)
      ??wharves.reduce<Site|undefined>((best,site)=>!best||Math.abs(sitePoint(site).x-focusX)<Math.abs(sitePoint(best).x-focusX)?site:best,undefined);
    const reach=Math.max(1000,(plan.end-900)/12.5+950);
    for(const [i,slot] of fleet.entries()){
      const berth=i===1&&stop?mooring(stop):undefined;
      const active=plan.sites.some(site=>!site.quiet)&&(i===0||!!berth);
      const key=active?[reach,i,berth?.station,berth?.bank,berth?.offset,berth?.slope,crossing].join('/'):'';
      if(slot.route===key)continue;
      const previous=slot.course;
      slot.route=key;
      slot.course=active?new FerryCourse(reach,i===0?1:-1,berth,crossing):undefined;
      if(slot.course){
        let station=berth?.station??focusX+47,reverse=i===0;
        if(previous){
          const sailing=previous.sample(time+slot.phase);
          station=previous.getPointAt(sailing.progress).x;
          reverse=sailing.direction<0;
        }
        slot.phase=slot.course.clockAt(station,reverse)-time;
        if(!previous&&berth)slot.phase-=5;
      }
      slot.wake.clear();sea.wakeCounts[i]=0;
    }
  }
  function update(next:HarborPlan,savedPage?:string,viewInlet?:number){
    const previous=plan;
    pageTargets.invalidate();
    const savedSite=savedPage && !previous.addresses.has(savedPage)?next.addresses.get(savedPage):undefined;
    if(savedSite)selectedPage=savedPage;
    water.forceUpdate=true;
    plan=next;
    if(previous!==next)homes=next.homes??[];
    const focusSite=savedSite??next.latest;
    focusX=focusSite?sitePoint(focusSite).x:0;
    loadedInlet=viewInlet??Math.floor((focusX+72)/144);
    if(viewInlet!==undefined)focusX=valleyOrigin.z-target.z;
    const start=Math.max(next.start,(loadedInlet-1)*1800),end=Math.min(next.end,(loadedInlet+2)*1800);
    if(previous===next && viewInlet!==undefined && rangeKey===(start-900)/12.5+','+(end-900)/12.5){
      sailings(start,end);
      return;
    }
    roomHighlight.visible=false;
    construction?.arrival.finish();
    construction=undefined;
    refreshTerrain(start,end);releaseInstances(structures);rooms.sources.length=0;atmosphere.invalidateRooms();
    bridge?.dispose();bridge=undefined;
    detailViews.clear();
    for(const p of paths.children)if(p instanceof T.Mesh)p.geometry.dispose();paths.clear();
    const cluster=new T.Group(),visible=next.sites.filter(s=>s.x>=start&&s.x<end);
    const founded=bridgeStation(next.sites);
    const crossing=founded!==undefined&&visible.some(s=>s.bank===1&&Math.abs(sitePoint(s).x-founded)<13)?founded:undefined;
    const distantQuays:ReturnType<typeof placeLot>[]=[];
    for(const site of next.sites){
      if(site.x>=start && site.x<end)continue;
      const p=sitePoint(site),angle=siteHeading(site,p.x),width=site.width/17;
      if(founded!==undefined&&crossing===undefined&&site.kind==='wharf'&&Math.abs(p.x-founded)<13){
        const quay=placeLot(site,shop.site(site),founded);
        distantQuays.push(quay);cluster.add(quay.model);continue;
      }
      if(site.kind==='pines'){
        cluster.add(shop.site(site));continue;
      }
      if(isRiverVenue(site.kind)){
        const skyline=shop.skyline(site.kind,site.elevation!,site.lights,site.quiet?undefined:rooms.proxy);
        skyline.position.copy(p);skyline.rotation.y=angle;
        skyline.userData.addressSeed=hashPage(site.id);
        skyline.userData.workplace=isWorkplace(site.kind);
        skyline.userData.quiet=!!site.quiet;
        cluster.add(skyline);continue;
      }
      const floors=site.kind==='towers'?8:site.kind==='apartments'||site.kind==='belfry'?5:2;
      const h=(floors+site.lights)*1.7;
      const facade:T.Mesh=shop.box(cluster,'masonry',p.x,p.y+h/2,p.z,width,h,4);facade.rotation.y=angle;
      if(!site.quiet){
        facade.material=rooms.proxy;facade.userData.addressSeed=hashPage(site.id);facade.userData.workplace=isWorkplace(site.kind);
      }
      shop.box(cluster,'copper',p.x,p.y+h+.24,p.z,width+.28,.6,4.24).rotation.y=angle;
    }
    const lots=visible.map(site=>placeLot(site,shop.site(site),crossing));
    soundPlaces.length=0;
    for(const {site,model} of lots){
      const position=inValley(model.position);
      if(site.kind==='pines')soundPlaces.push({id:site.id,position,kind:'grove',level:1});
      else if(!site.quiet){
        const dock=site.kind==='wharf'||site.kind==='crane'||site.ferryTerminal;
        soundPlaces.push({id:site.id,position,kind:dock?'dock':'street',level:site.kind==='market'?.36:.18});
      }
    }
    const clearance=railClearance(lots);
    const laneOf = (s:Site) => s.kind==='wharf'?3:s.lane;
    meadow?.clearPaths();
    const reserved=gardenClearance();
    const approaches:T.Vector3[]=[];
    const streetsByBank=new Map<number,T.Vector3[][]>();
    const walkways:T.Vector3[][]=[],fronts:ShopFront[]=[];
    for(const bank of [0,1] as const){
      const bankLots=lots.filter(lot=>lot.site.bank===bank);
      if(!bankLots.length)continue;
      const edges=new Map<number,number>();
      for(const {site,model} of bankLots) {
        const inlet=Math.floor(site.x/1800);
        const west=model.position.x-Math.max(5.8,site.width/27);
        edges.set(inlet,Math.min(edges.get(inlet)??Infinity,west));
      }
      const streets=[0,1,2,3].map(lane=>{
        const neighbors=bankLots.filter(lot=>laneOf(lot.site)===lane);
        const inlets=new Set(neighbors.map(lot=>Math.floor(lot.site.x/1800)));
        const junctions=Array.from(inlets,i=>edges.get(i)!);
        if(crossing!==undefined&&lane===3&&neighbors.length)junctions.push(crossing-1.5,crossing+1.5);
        return streetLine(neighbors,lane,junctions);
      });
      streetsByBank.set(bank,streets);
      walkways.push(...streets);
      function connectLanes(a:T.Vector3,b:T.Vector3){
        const line=hillsidePassage(shop,cluster,a,b,bank,clearance);
        if(line)walkways.push(line);
      }
      if(crossing!==undefined){
        const front=streets.slice().reverse().find(line=>line.length);
        if(front){
          const foot=front.reduce((a,b)=>Math.abs(a.x-crossing)<Math.abs(b.x-crossing)?a:b);
          approaches.push(foot);
          const inland=streets.slice(0,streets.indexOf(front)).reverse().find(line=>line.length);
          const continuation=inland&&bridgeApproach(foot,front,inland,clearance);
          if(continuation){
            const {from,to}=continuation;
            const along=to.clone().sub(from).setY(0).normalize();
            for(const joint of [from,to]){
              clearance.opening(joint.clone().addScaledVector(along,-1),joint.clone().addScaledVector(along,1),1.5);
            }
            pavedRun(shop,cluster,from,to,true,1.4,clearance);
            walkways.push([from,to]);
          }
          clearance.opening(foot.clone().add(v(0,0,-1.45)),foot.clone().add(v(0,0,1.45)),2.1);
        }
      }
      for(const lot of bankLots){
        const line=streets[laneOf(lot.site)]!;
        for(const exit of lot.gallery){
          const {target}=doorRoute(exit,line);
          clearance.opening(target.clone().lerp(exit,.18),target,1.05);
        }
      }
      for (const line of streets) {
        if (!line.length) continue;
        for(const q of line){meadow?.mow(q.x,q.z,.78);reserved.mark(q.x,q.z,1.03);}
        paths.add(streetDeck(shop,line));
        streetFurniture(shop,cluster,line,clearance);
      }
      for(const [inlet,x] of edges) {
        const lanes=new Set(bankLots.filter(lot=>Math.floor(lot.site.x/1800)===inlet).map(lot=>laneOf(lot.site)));
        let above:T.Vector3|undefined;
        for(const lane of [...lanes].sort((a,b)=>a-b)) {
          const point=streets[lane]!.reduce((a,b)=>Math.abs(a.x-x)<Math.abs(b.x-x)?a:b);
          if(above) connectLanes(above,point);
          above=point;
        }
      }
      for(const {above,below} of neighborhoodPassages(bankLots,streets))connectLanes(above,below);
    }
    if(founded!==undefined&&crossing===undefined){
      for(const bank of [0,1] as const){
        const quays=distantQuays.filter(q=>q.site.bank===bank);
        if(!quays.length)continue;
        const street=streetLine(quays,3,[founded-1.5,founded+1.5]);
        paths.add(streetDeck(shop,street));
        approaches.push(street.reduce((a,b)=>Math.abs(a.x-founded)<Math.abs(b.x-founded)?a:b));
        for(const quay of quays)connectDoors(shop,cluster,quay,street);
      }
    }
    if(approaches.length===2){
      bridge=footbridge(approaches[0]!,approaches[1]!,shop.paint);
      cluster.add(bridge.deck);
    }
    function clearWalk(part:T.Object3D){
      if(!(part instanceof T.Mesh)||part.material!==shop.materials.coping)return;
      const radius=part.scale.x*.54;
      meadow?.mow(part.position.x,part.position.z,radius);reserved.mark(part.position.x,part.position.z,radius+.16);
    }
    parcels.length=0;
    const still=paused||motionPreference.matches;
    for(const lot of lots) {
      const {model,site,doors}=lot;
      parcels.push({site,box:new T.Box3().setFromObject(model)});
      const residents = next.details?.addresses.get(site.id);
      if (residents) furnishAddress(model, residents, furniture, shop, (page, anchor) => {
        detailViews.set(page, {target:inValley(anchor.localToWorld(v(0,.38,0))),
          eye:inValley(anchor.localToWorld(v(2.4,2.7,7.8)))});
      });
      const access=new T.Group();
      const entrance=connectDoors(shop,access,lot,streetsByBank.get(site.bank)![laneOf(site)]!,clearance);
      if(entrance)fronts.push({site,origin:entrance.origin,target:entrance.target});
      else{
        const street=streetsByBank.get(site.bank)?.[laneOf(site)];
        if(street?.length){
          const edge=street.reduce((a,b)=>a.distanceToSquared(model.position)<b.distanceToSquared(model.position)?a:b);
          fronts.push({site,origin:edge,target:edge});
        }
      }
      access.traverse(clearWalk);
      model.attach(access);
      const newBuilding=site===savedSite && site.id===savedPage;
      if(site===savedSite && savedPage && !newBuilding){
        const room=next.rooms.get(savedPage);
        const floor=model.getObjectByName('Room floor '+room);
        const ledge=floor?.getObjectByName('Window ledge');
        const lantern=model.getObjectByName('Room lantern '+(site.litAdditions??room));
        const anchor=ledge??lantern;
        if(anchor){
          const position=anchor.localToWorld(v(0,ledge ? .48 : 0,0));
          roomHighlight.position.copy(position);
          roomHighlight.visible=!still;
          roomHighlight.material.uniforms.strength!.value=0;
          roomAge=0;
          const cameraAnchor=ledge??model;
          const eye=position.clone().add(v(2.4,2.7,8).applyQuaternion(cameraAnchor.getWorldQuaternion(new T.Quaternion())));
          detailViews.set(savedPage,{target:inValley(position),eye:inValley(eye)});
        }
      }
      if(newBuilding && still && site.kind!=='pines')sound?.settle(inValley(model.position));
      if(newBuilding && !still) {
        const addition=bake(model,valley.plant,rooms);
        structures.add(addition);
        construction={arrival:buildingArrival(addition,model.position.y,Math.min(model.position.y-.65,...doors.map(door=>landHeight(door.exit.x,door.exit.z)))),start:time,site};
      } else cluster.add(model);
    }
    for(const item of cluster.children)clearWalk(item);
    const grade=cutBuildingPlots(lots,reserved);
    valley.gradeTown(grade);checkedEye.x=Infinity;
    const footprints=parcels.map(parcel=>parcel.box);
    for(const bank of [0,1] as const){
      landscapeWaterfront(shop,gardens.plants,courts,next.neighborhoods,bank,(start-900)/12.5-80,(end-900)/12.5+80,
        lots.filter(lot=>lot.site.bank===bank),streetsByBank.get(bank)??[],reserved,grade,footprints,paths,cluster,structures,(x,z,r)=>meadow?.mow(x,z,r),
        key => {const detail = next.details?.streets.get(key); return detail && furniture.build(shop,detail);});
    }
    residents.place(homes,lots,streetsByBank,fronts,walkways);
    structures.add(bake(cluster,valley.plant,rooms));
    const positions:number[]=[],radii:number[]=[];
    for(const subset of structures.children){
      subset.updateMatrixWorld(true);
      subset.traverse(item=>{
        if(!(item instanceof T.InstancedMesh)||item.material!==shop.materials.lamp||item.geometry!==shop.geometries.plinth)return;
        const matrix=new T.Matrix4(),p=new T.Vector3(),scl=new T.Vector3();
        for(let i=0;i<item.count;i++){
          item.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);scl.setFromMatrixScale(matrix);
          positions.push(p.x,p.y+.04,p.z);radii.push(scl.x>1?3.45:1.07);
        }
      });
    }
    glows.geometry.dispose();glows.geometry=new T.BufferGeometry();glows.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));glows.geometry.setAttribute('radius',new T.Float32BufferAttribute(radii,1));glows.visible=positions.length>0;
    const beacon=visible.filter(s=>s.kind==='beacon'&&!s.quiet).sort((a,b)=>Math.abs(sitePoint(a).x-focusX)-Math.abs(sitePoint(b).x-focusX))[0];
    beamReady=!!beacon;if(beacon){beam.position.copy(lots.find(lot=>lot.site===beacon)!.model.position);beam.position.y+=8.61;}
    sailings(start,end);
    renderer.shadowMap.needsUpdate=true;
    if(viewInlet===undefined){
      if(savedSite && savedPage && detailViews.has(savedPage))visit('Page',savedPage);
      else if(savedSite){
        const raised=inValley(sitePoint(savedSite));raised.y+=2;
        const screen=raised.project(camera);
        if(!framed||Math.abs(screen.x)>.80||Math.abs(screen.y)>.64||screen.z>1||screen.z< -1)fit(true);
      }else if(!inspected)fit();
    }
    framed=next.sites.length>0;schedule();
  }
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);sea.resize(w*renderer.getPixelRatio(),h*renderer.getPixelRatio());atmosphere.resize(w,h);glows.material.uniforms.screen!.value=h*renderer.getPixelRatio()*1.9;camera.aspect=w/h;camera.updateProjectionMatrix();checkedEye.x=Infinity;if(!inspected)fit();schedule();
  }
  function visibility(){
    syncSound();
    if(document.hidden||skipped){input.reset();cancelAnimationFrame(frame);frame=0;last=0;}else {clockCheck=-Infinity;schedule();}
  }
  function syncSound(){
    if(!audioContext||audioContext.state==='closed')return;
    const audible=soundEnabled&&!document.hidden&&!skipped;
    sound?.mix(audible,pageOpen);
    if(audible && audioContext.state!=='running')void audioContext.resume().catch(()=>{});
    if(!audible)void audioContext.suspend().catch(()=>{});
  }
  function setSound(context:AudioContext|undefined,enabled:boolean,reading:boolean){
    if(context && !sound){audioContext=context;sound=createValleySound(context,schedule);}
    soundEnabled=enabled;pageOpen=reading;syncSound();schedule();
  }
  canvas.addEventListener('contentvisibilityautostatechange',e=>{skipped=(e as ContentVisibilityAutoStateChangeEvent).skipped;visibility();},options);
  document.addEventListener('visibilitychange',visibility,options);
  window.addEventListener('pageshow',visibility,options);
  const stopClock=fixedHour===undefined?onLocalMinute(()=>{if(paused&&!document.hidden&&!skipped){clockCheck=-Infinity;schedule();}}):undefined;
  const input=valleyInput(canvas,camera,target,signals.signal,schedule,
    ()=>{inspected=true;framing=undefined;leaveResident();checkedEye.x=Infinity;},()=>{inspected=false;fit(true);},
    (x,y)=>{
      if(onMeet){
        const bounds=canvas.getBoundingClientRect();
        residentRay.setFromCamera(new T.Vector2((x-bounds.left)/bounds.width*2-1,1-(y-bounds.top)/bounds.height*2),camera);
        const hit=residents.pick(residentRay);
        if(hit){
          residentRay.far=hit.distance;
          const hidden=residentRay.intersectObject(structures,true).length>0;
          residentRay.far=Infinity;
          if(!hidden){onMeet(hit.id);return;}
        }
      }
      if(!onPage)return;
      const found=pageTargets.pick(x,y);
      if(found)onPage(selectedPage&&plan.addresses.get(selectedPage)===found?selectedPage:found.readableId??found.id);
    });
  canvas.addEventListener('pointermove',e=>{
    if(!onPage||e.pointerType==='touch')return;
    pageTargets.hover(e.buttons?undefined:pageTargets.pick(e.clientX,e.clientY));if(paused)schedule();
  },options);
  canvas.addEventListener('pointerleave',e=>{
    if(e.relatedTarget instanceof Element && e.relatedTarget.closest('[data-page-marker]'))return;
    pageTargets.hover();if(paused)schedule();
  },options);
  world.setPainted(!!shop.paint);
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  return {update,visit,visitResident,setSound,pause(value:boolean){paused=value;last=0;schedule();},destroy(){
    residents.dispose();sound?.destroy();
    construction?.arrival.finish();
    bridge?.dispose();meadow?.dispose();rooms.dispose();stopClock?.();
    dead=true;cancelAnimationFrame(frame);observer.disconnect();signals.abort();releaseInstances(structures);releaseInstances(scenery);releaseInstances(tunnel);bore.dispose();
    for(const p of paths.children)if(p instanceof T.Mesh)p.geometry.dispose();
    for(const slot of fleet)releaseInstances(slot.boat);
    const hull=vessel.children[0];if(hull instanceof T.Mesh)hull.geometry.dispose();
    beamGeometry.dispose();beamMaterial.dispose();glows.geometry.dispose();glows.material.dispose();roomHighlight.geometry.dispose();roomHighlight.material.dispose();valley.dispose();atmosphere.dispose();world.dispose();sea.dispose();gardens.dispose();furniture.dispose();shop.dispose();renderer.dispose();
  }};
}
