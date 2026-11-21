import { batchPlantings } from './tree-batches.js';
import type { WoodlandTree } from './woodland-boughs.js';
import { groveCell } from './corridor-vegetation.js';
import { constrainValleyView, valleyZoomLimit } from './valley-camera.js';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGreenCorridor } from './green-corridor.js';
import { inValley, valleyOrigin,riverWidth } from './valley-river.js';
import { createBayWater } from './bay-water.js';
import { createBayAtmosphere } from './bay-atmosphere.js';
import { harborWorkshop, landHeight, shoreline, siteHeading, sitePoint, type Workshop } from './harbor-workshop.js';
import { buildingArrival } from './building-arrival.js';
import { connectDoors, hillsidePassage, placeLot, streetFurniture, streetLine } from './harbor-streets.js';
import { cutBuildingPlots, gardenClearance, landscapeWaterfront, loadGardenPlants } from './waterfront-gardens.js';
import { createBayWorld } from './bay-world.js';
import { ferryBerthOffset } from './ferry-hall.js';
import { hashPage } from './city-growth.js';
import type { Coast, Site } from './painted-coast.js';
import { createMeadow, groveDensity, plantGroves } from './waterfront-meadow.js';

function bake(source:T.Object3D,plant:(trees:WoodlandTree[],rotation:number)=>T.Group){
  source.updateMatrixWorld(true);
  const parts=new Map<T.BufferGeometry,Map<T.Material,T.Matrix4[]>>();
  const trees:WoodlandTree[]=[];
  function collect(o:T.Object3D){
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
      const list=bySkin.get(o.material)??[];list.push(o.matrixWorld.clone());
      bySkin.set(o.material,list);parts.set(o.geometry,bySkin);
    }
    for(const child of o.children)collect(child);
  }
  collect(source);
  const result=plant(trees,Math.PI/2);
  for(const [geometry,bySkin] of parts)for(const [material,instances] of bySkin){
    result.add(batchPlantings(geometry,material,instances));
  }
  return result;
}
function releaseInstances(group:T.Object3D){
  group.traverse(o=>{
    if(o instanceof T.InstancedMesh)o.dispose();
    else if(o instanceof T.Mesh && o.geometry instanceof T.InstancedBufferGeometry)o.geometry.dispose();
  });group.clear();
}
const shoreRows=107,shoreInterval=.87;
function meadowSurface(left:number,right:number){
  const positions:number[]=[],indices:number[]=[],habitat:number[]=[];
  const cols=Math.ceil(right-left+56);
  for(let i=0;i<=cols;i++){
    const x=left-28+i,edge=shoreline(x);
    for(let j=0;j<shoreRows;j++){
      const depth=-6+j*shoreInterval,z=edge-depth;
      positions.push(x,landHeight(x,z),z);habitat.push(groveDensity(x,z)*T.MathUtils.smoothstep(depth,27,35));
      if(i<cols&&j+1<shoreRows){const k=i*shoreRows+j;indices.push(k,k+shoreRows,k+1,k+shoreRows,k+shoreRows+1,k+1);}
    }
  }
  const g=new T.BufferGeometry();g.setIndex(indices);g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('habitat',new T.Float32BufferAttribute(habitat,1));g.computeVertexNormals();return g;
}
function streetDeck(shop:Workshop,points:T.Vector3[],width:number){
  const p:number[]=[],uv:number[]=[],indices:number[]=[],pavement:number[]=[];
  let length=0;
  for(let i=0;i<points.length;i++){
    const here=points[i]!,before=points[Math.max(0,i-1)]!,after=points[Math.min(points.length-1,i+1)]!;
    const tangent=after.clone().sub(before),side=new T.Vector2(-tangent.z,tangent.x).normalize().multiplyScalar(width/2);
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
        uv.push(length*.48,((j>=2?width:0)+v.y-here.y)*.5);
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
function ferryCourse(wharf: Site) {
  const berth = sitePoint(wharf);
  const heading = siteHeading(wharf, berth.x);
  const outward = new T.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const along = new T.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const stops = [[0, 0], [3, 0], [8, 2], [14, 7], [17, 14], [7, 19], [-8, 16], [-12, 8], [-8, 3], [-3, 0]];
  const points = stops.map(([x, z]) => {
    const p = berth.clone().addScaledVector(along, x!).addScaledVector(outward, ferryBerthOffset + z!);
    if (z! > 0) p.z = Math.max(p.z, shoreline(p.x) + 4);
    p.y = .09;
    return p;
  });
  return new T.CatmullRomCurve3(points, true);
}

export type ValleyView='City'|'Overlook';
export async function createHarbor(canvas:HTMLCanvasElement,onPage?:(id:string)=>void,afterglow=false){
  const [shop,gardens]=await Promise.all([harborWorkshop(),loadGardenPlants()]);
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  const scene=new T.Scene();
  const world=createBayWorld(scene,afterglow);
  const valley=await createGreenCorridor(shop.materials.heath.map!,shop.treeModels,world.lighting,shop.paint);
  renderer.localClippingEnabled=true;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  const camera=new T.PerspectiveCamera(47,1,.30,valley.far);
  scene.fog=new T.FogExp2('#66827f',.00014);
  const sea=createBayWater(world.sunDirection,world.sun,renderer.extensions.has('EXT_color_buffer_float'),afterglow),water=sea.water;
  const atmosphere=createBayAtmosphere(renderer,scene,camera,world.sun,world.sunDirection,afterglow);
  scene.add(water,valley.root);
  const city=new T.Group();city.position.set(valleyOrigin.x,0,valleyOrigin.z);city.rotation.y=Math.PI/2;scene.add(city);
  const localEye=new T.Vector3();
  const orbit=new OrbitControls(camera,canvas);orbit.enableDamping=false;orbit.minPolarAngle=.22;orbit.maxPolarAngle=1.84;
  orbit.minDistance=7;orbit.maxDistance=valleyZoomLimit;
  orbit.rotateSpeed=.64;orbit.panSpeed=.76;orbit.zoomSpeed=.88;orbit.screenSpacePanning=false;
  const scenery=new T.Group(),structures=new T.Group(),paths=new T.Group(),travel=new T.Group();
  city.add(scenery,structures,paths,travel);
  const boat=shop.ferry();travel.add(boat);
  const tram=new T.Group();shop.box(tram,'copper',0,.25,0,1.86,.48,.58);shop.box(tram,'lamp',0,.33,0,1.57,.19,.6);shop.box(tram,'iron',0,.54,0,1.9,.10,.65);travel.add(tram);
  const beamGeometry=new T.CylinderGeometry(.028,.91,17,24,1,true);
  beamGeometry.rotateZ(Math.PI/2);beamGeometry.translate(8.5,0,0);
  const beamMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
    vertexShader:'varying float along;void main(){along=position.x/17.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying float along;void main(){gl_FragColor=vec4(1.,.77,.42,.061*pow(max(0.,1.-along),1.8));}'});
  const beam=new T.Mesh(beamGeometry,beamMaterial);beam.renderOrder=2;travel.add(beam);
  const wakeGeo=new T.BufferGeometry();
  wakeGeo.setAttribute('position',new T.Float32BufferAttribute([-1.55,.03,-.36,-6.8,.035,-1.16,-4.2,.038,-.64,-1.55,.03,.36,-4.2,.038,.64,-6.8,.035,1.16],3));
  const wakeMat=new T.MeshBasicMaterial({color:'#c9d3c7',opacity:.38,transparent:true,depthWrite:false,side:T.DoubleSide});
  const wake=new T.Mesh(wakeGeo,wakeMat);wake.renderOrder=2;boat.add(wake);
  const signals=new AbortController(),options={signal:signals.signal};
  let rangeKey='',plan:Coast={sites:[],addresses:new Map(),service:0,start:0,end:1800};
  let meadow:ReturnType<typeof createMeadow>|undefined;
  const glows=new T.Points(new T.BufferGeometry(),new T.ShaderMaterial({
    uniforms:{screen:{value:500}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:'uniform float screen;attribute float radius;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(radius*screen/max(1.,-p.z),2.,76.);}',
    fragmentShader:'void main(){float r=length(gl_PointCoord-.5)*2.;float a=exp(-5.6*r*r)*(1.-smoothstep(.76,1.,r));gl_FragColor=vec4(1.,.54,.22,a*.40);}'
  }));glows.renderOrder=2;city.add(glows);
  let frame=0,paused=false,skipped=false,dead=false,last=0,time=afterglow?133:0,framed=false,inspected=false;
  let lastShadowTime = -Infinity;
  const shadowEye=new T.Vector3(Infinity,0,0);
  let focusX=0,loadedInlet=0,course:T.CatmullRomCurve3|undefined,rail:Site|undefined;
  let construction: {arrival:ReturnType<typeof buildingArrival>; start:number; site:Site} | undefined;
  let framing: {from:T.Vector3; to:T.Vector3; eye:T.Vector3; end:T.Vector3; start:number} | undefined;
  let beamReady=false, tramReady=false, ferryReady=false;
  let selectedPage:string|undefined;
  const parcels:{box:T.Box3;site:Site}[]=[];
  const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
  function cityPose(station:number){
    const visible=plan.sites.map(sitePoint).filter(p=>Math.abs(p.x-station)<90);
    const district=new T.Box3().setFromPoints(visible);
    const center=visible.length?district.getCenter(new T.Vector3()):v(station,3,shoreline(station)-15);
    const base=inValley(center),size=district.getSize(new T.Vector3());
    const reach=T.MathUtils.clamp(36+size.x*.73+size.z*.24/Math.max(.52,camera.aspect),36,158);
    const facing=station>145?-1:1;
    return {target:base.clone().add(v(0,3+reach*.14,-4*facing)),eye:base.clone().add(v(.24,.36,facing).multiplyScalar(reach))};
  }
  function visit(view:ValleyView|'Page',id?:string){
    const site=id?plan.addresses.get(id):undefined;
    const p=site?inValley(sitePoint(site)):undefined;
    const pose=view==='Overlook'?{eye:v(70,165,493),target:v(73,132,263)}:
      p?{eye:p.clone().add(v(11,8,13)),target:p.clone().add(v(0,2,0))}:cityPose(plan.latest?sitePoint(plan.latest).x:0);
    selectedPage=id;
    inspected=true;moveTo(pose,true);
  }
  function moveTo(pose:{eye:T.Vector3;target:T.Vector3},glide:boolean){
    if(glide&&!paused)framing={from:orbit.target.clone(),to:pose.target,eye:camera.position.clone(),end:pose.eye,start:time};
    else{framing=undefined;orbit.target.copy(pose.target);camera.position.copy(pose.eye);orbit.update();}
    schedule();
  }
  const checkedEye=new T.Vector3(Infinity,0,0),checkedTarget=new T.Vector3();
  function constrainCamera(){
    if(checkedEye.equals(camera.position)&&checkedTarget.equals(orbit.target))return;
    const halfHeight=camera.near*Math.tan(T.MathUtils.degToRad(camera.fov)*.5);
    const clearanceRadius=Math.hypot(camera.near,halfHeight,halfHeight*camera.aspect);
    const upstream=valleyOrigin.z-(plan.end-900)/12.5;
    constrainValleyView(camera.position,orbit.target,valley.bounds,upstream,valley.ground,clearanceRadius);
    camera.lookAt(orbit.target);camera.updateMatrixWorld();
    checkedEye.copy(camera.position);checkedTarget.copy(orbit.target);
  }
  function schedule(){if(!frame&&!dead&&!document.hidden&&!skipped)frame=requestAnimationFrame(draw);}
  function draw(now:number){
    frame=0;if(dead||document.hidden||skipped)return;
    constrainCamera();
    const centerInlet=T.MathUtils.clamp(Math.floor((valleyOrigin.z-orbit.target.z+72)/144),plan.start/1800,plan.end/1800-1);
    if(inspected&&!framing&&centerInlet!==loadedInlet)update(plan,false,centerInlet);
    if(!paused&&last&&now-last<30){schedule();return;}
    const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(!paused)time+=dt;
    if (framing) {
      const t=paused?1:T.MathUtils.smootherstep((time-framing.start)/1.25,0,1);
      orbit.target.lerpVectors(framing.from,framing.to,t);
      camera.position.lerpVectors(framing.eye,framing.end,t);
      orbit.update();
      if (t===1) framing=undefined;
    }
    constrainCamera();
    if (construction) {
      const progress=paused?1:Math.min(1,(time-construction.start)/1.85);
      construction.arrival.sample(progress);
      if (progress===1) {
        construction.arrival.finish();
        construction=undefined;
      }
      if (!construction || time-lastShadowTime>.10) {
        renderer.shadowMap.needsUpdate=true;
        lastShadowTime=time;
      }
    }
    beam.visible=beamReady && construction?.site.kind!=='beacon';
    tram.visible=tramReady && construction?.site!==rail;
    boat.visible=ferryReady && !construction?.site.ferryTerminal;
    beam.rotation.y=-Math.PI*.5+Math.sin(time*.18)*1.20;
    if(course){
      const transit = T.MathUtils.clamp((time % 96 - 8) / 88, 0, 1);
      const progress = T.MathUtils.smootherstep(transit, 0, 1);
      course.getPointAt(progress, boat.position);
      boat.position.y += .027 * Math.sin(time * 1.05);
      const tangent = course.getTangentAt(progress);
      boat.rotation.y = -Math.atan2(tangent.z, tangent.x);
      wake.visible = transit > .035 && transit < .965;
    }
    if(rail){const p=sitePoint(rail);tram.position.copy(p);tram.rotation.y=-Math.atan(shoreline(p.x+.5)-shoreline(p.x-.5))*.77+(hashPage(rail.id)%15-7)*.014;
      tram.translateX(Math.sin(time*.105)*4.85);tram.position.y+=2.99;}
    world.setTime(time,valleyOrigin.x+shoreline(focusX)-15,camera.position.x,valleyOrigin.z-focusX);
    if (time - lastShadowTime >= 3 || shadowEye.distanceToSquared(camera.position)>(paused?0:2.25)) {
      renderer.shadowMap.needsUpdate = true;
      lastShadowTime = time;
    }
    if(renderer.shadowMap.needsUpdate)shadowEye.copy(camera.position);
    water.position.x=camera.position.x;
    water.position.z=camera.position.z;
    shop.breezeTime.value=time;
    city.worldToLocal(localEye.copy(camera.position));meadow?.view();
    valley.tick(time,camera.position);sea.clock.value=time;atmosphere.render(time);
    if(!paused)schedule();
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
    plantGroves(left,right,x=>-shoreline(x)-riverWidth(x)+23,(x,z)=>landHeight(x,-z),(x,y,z,h,seed)=>shop.tree(woods,x,y,-z,h,seed));
    scenery.add(bake(woods,valley.plant));
  }
  function update(next:Coast,reveal=false,viewInlet?:number){
    water.forceUpdate=true;
    construction?.arrival.finish();
    construction=undefined;
    plan=next;focusX=next.latest?sitePoint(next.latest).x:0;
    loadedInlet=viewInlet??Math.floor((focusX+72)/144);
    if(viewInlet!==undefined)focusX=valleyOrigin.z-orbit.target.z;
    const start=Math.max(next.start,(loadedInlet-1)*1800),end=Math.min(next.end,(loadedInlet+2)*1800);
    refreshTerrain(start,end);releaseInstances(structures);
    for(const p of paths.children)if(p instanceof T.Mesh)p.geometry.dispose();paths.clear();
    const cluster=new T.Group(),visible=next.sites.filter(s=>s.x>=start&&s.x<end);
    for(const site of next.sites){
      if(site.x>=start && site.x<end)continue;
      const p=sitePoint(site),angle=siteHeading(site,p.x),width=site.width/17;
      if(site.kind==='pines'){
        cluster.add(shop.site(site));continue;
      }
      const floors=site.kind==='towers'?8:site.kind==='apartments'||site.kind==='belfry'?5:2;
      const h=(floors+site.lights)*1.7;
      shop.box(cluster,'masonry',p.x,p.y+h/2,p.z,width,h,4).rotation.y=angle;
      shop.box(cluster,'copper',p.x,p.y+h+.24,p.z,width+.28,.6,4.24).rotation.y=angle;
    }
    const lots=visible.map(site=>placeLot(site,shop.site(site)));
    const laneOf = (s:Site) => s.kind==='wharf'?3:s.lane;
    const edges=new Map<number,number>();
    for(const {site,model} of lots) {
      const inlet=Math.floor(site.x/1800);
      const west=model.position.x-Math.max(5.8,site.width/27);
      edges.set(inlet,Math.min(edges.get(inlet)??Infinity,west));
    }
    const streets=[0,1,2,3].map(lane=>{
      const neighbors=lots.filter(lot=>laneOf(lot.site)===lane);
      const inlets=new Set(neighbors.map(lot=>Math.floor(lot.site.x/1800)));
      return streetLine(neighbors,lane,Array.from(inlets,i=>edges.get(i)!));
    });
    meadow?.clearPaths();
    const reserved=gardenClearance();
    for (const line of streets) {
      if (!line.length) continue;
      for(const q of line){meadow?.mow(q.x,q.z,.78);reserved.mark(q.x,q.z,1.03);}
      paths.add(streetDeck(shop,line,1.34));
      streetFurniture(shop,cluster,line);
    }
    for(const [inlet,x] of edges) {
      const lanes=new Set(lots.filter(lot=>Math.floor(lot.site.x/1800)===inlet).map(lot=>laneOf(lot.site)));
      let above:T.Vector3|undefined;
      for(const lane of [...lanes].sort((a,b)=>a-b)) {
        const point=streets[lane]!.reduce((a,b)=>Math.abs(a.x-x)<Math.abs(b.x-x)?a:b);
        if(above) hillsidePassage(shop,cluster,above,point);
        above=point;
      }
    }
    const blocks=new Map<number,Set<number>>();
    for(const {site} of lots){
      const column=Math.round((site.x-132-site.lane*8)/157);
      const lanes=blocks.get(column)??new Set<number>();lanes.add(laneOf(site));blocks.set(column,lanes);
    }
    for(const [column,lanes] of blocks){
      if(column%3!==1)continue;
      const x=(132+(column+.5)*157+12-900)/12.5;
      for(const lane of lanes){
        if(!lanes.has(lane+1))continue;
        const nearest=(line:T.Vector3[])=>line.reduce((a,b)=>Math.abs(a.x-x)<Math.abs(b.x-x)?a:b);
        const a=nearest(streets[lane]!),b=nearest(streets[lane+1]!);
        if(Math.abs(a.x-x)<.5 && Math.abs(b.x-x)<.5)hillsidePassage(shop,cluster,a,b);
      }
    }
    function clearWalk(part:T.Object3D){
      if(!(part instanceof T.Mesh)||part.material!==shop.materials.coping)return;
      const radius=part.scale.x*.54;
      meadow?.mow(part.position.x,part.position.z,radius);reserved.mark(part.position.x,part.position.z,radius+.16);
    }
    parcels.length=0;
    for(const lot of lots) {
      const {model,site,doors}=lot;
      parcels.push({site,box:new T.Box3().setFromObject(model)});
      const access=new T.Group();
      connectDoors(shop,access,lot,streets[laneOf(site)]!);
      access.traverse(clearWalk);
      model.attach(access);
      if(reveal && site===next.latest && !paused && site.lights===0) {
        const addition=bake(model,valley.plant);
        structures.add(addition);
        construction={arrival:buildingArrival(addition,model.position.y,Math.min(model.position.y-.65,...doors.map(door=>landHeight(door.exit.x,door.exit.z)))),start:time,site};
      } else cluster.add(model);
    }
    for(const item of cluster.children)clearWalk(item);
    const grade=cutBuildingPlots(lots,reserved);
    valley.gradeTown(grade);checkedEye.x=Infinity;
    landscapeWaterfront(shop,gardens.plants,lots,reserved,grade,parcels.map(p=>p.box),paths,cluster,structures,(x,z,r)=>meadow?.mow(x,z,r));
    structures.add(bake(cluster,valley.plant));
    const positions:number[]=[],radii:number[]=[];
    for(const subset of structures.children){
      subset.updateMatrixWorld(true);
      subset.traverse(item=>{
        if(!(item instanceof T.InstancedMesh)||item.material!==shop.materials.lamp)return;
        const matrix=new T.Matrix4(),p=new T.Vector3(),scl=new T.Vector3();
        for(let i=0;i<item.count;i++){
          item.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);scl.setFromMatrixScale(matrix);
          positions.push(p.x,p.y+.04,p.z);radii.push(scl.x>1?3.45:1.07);
        }
      });
    }
    glows.geometry.dispose();glows.geometry=new T.BufferGeometry();glows.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));glows.geometry.setAttribute('radius',new T.Float32BufferAttribute(radii,1));glows.visible=positions.length>0;
    const beacon=visible.filter(s=>s.kind==='beacon').sort((a,b)=>Math.abs(sitePoint(a).x-focusX)-Math.abs(sitePoint(b).x-focusX))[0];
    beamReady=!!beacon;if(beacon){beam.position.copy(lots.find(lot=>lot.site===beacon)!.model.position);beam.position.y+=8.61;}
    const wharf=visible.filter(s=>s.ferryTerminal).sort((a,b)=>Math.abs(sitePoint(a).x-focusX)-Math.abs(sitePoint(b).x-focusX))[0];
    course=wharf?ferryCourse(wharf):undefined;
    rail=visible.find(s=>s.kind==='arches');ferryReady=!!course;tramReady=!!rail;
    renderer.shadowMap.needsUpdate=true;
    if(viewInlet===undefined){
      if(reveal && next.latest){
        const raised=inValley(sitePoint(next.latest));raised.y+=2;
        const screen=raised.project(camera);
        if(!framed||Math.abs(screen.x)>.80||Math.abs(screen.y)>.64||screen.z>1||screen.z< -1)fit(true);
      }else if(!inspected)fit();
    }
    framed=next.sites.length>0;schedule();
  }
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);atmosphere.resize(w,h);glows.material.uniforms.screen!.value=h*renderer.getPixelRatio()*1.9;camera.aspect=w/h;camera.updateProjectionMatrix();checkedEye.x=Infinity;if(!inspected)fit();schedule();
  }
  function visibility(){
    if(document.hidden||skipped){cancelAnimationFrame(frame);frame=0;last=0;}else schedule();
  }
  canvas.addEventListener('contentvisibilityautostatechange',e=>{skipped=(e as ContentVisibilityAutoStateChangeEvent).skipped;visibility();},options);
  document.addEventListener('visibilitychange',visibility,options);
  let press:{x:number;y:number;id:number}|undefined;
  canvas.addEventListener('pointerdown',e=>{press=e.isPrimary&&e.button===0?{x:e.clientX,y:e.clientY,id:e.pointerId}:undefined;},options);
  canvas.addEventListener('pointercancel',()=>{press=undefined;},options);
  canvas.addEventListener('pointerup',e=>{
    const start=press;press=undefined;
    if(!onPage||!start||start.id!==e.pointerId||Math.hypot(start.x-e.clientX,start.y-e.clientY)>5)return;
    const rect=canvas.getBoundingClientRect();
    const mouse=new T.Vector2(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height);
    const picker=new T.Raycaster();picker.setFromCamera(mouse,camera);
    const ray=picker.ray.applyMatrix4(city.matrixWorld.clone().invert()),hit=new T.Vector3();
    let best=Infinity,found:Site|undefined;
    for(const {box,site} of parcels){
      if(ray.intersectBox(box,hit)){const distance=hit.distanceTo(ray.origin);if(distance<best){best=distance;found=site;}}
    }
    if(found)onPage(selectedPage&&plan.addresses.get(selectedPage)===found?selectedPage:found.id);
  },options);
  orbit.addEventListener('start',()=>{inspected=true;framing=undefined;});orbit.addEventListener('change',schedule);
  canvas.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft')orbit.rotateLeft(.13);else if(e.key==='ArrowRight')orbit.rotateLeft(-.13);
    else if(e.key==='ArrowUp')orbit.rotateUp(.09);else if(e.key==='ArrowDown')orbit.rotateUp(-.09);
    else if(e.key==='+'||e.key==='=')orbit.dollyIn(1/1.16);else if(e.key==='-')orbit.dollyOut(1/1.16);
    else if(e.key==='Home'){inspected=false;fit();}else return;
    framing=undefined;if(e.key!=='Home')inspected=true;orbit.update();e.preventDefault();schedule();
  },options);
  function setPainted(enabled:boolean) {
    water.forceUpdate=true;
    world.setPainted(enabled && !!shop.paint);
    if (!shop.paint) return;
    shop.paint.coverage.value = enabled ? 1 : 0;
    (scene.fog as T.FogExp2).color.set(enabled ? '#66827f' : '#9d879b');
    schedule();
  }
  setPainted(true);
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  return {update,visit,hasPaint:!!shop.paint,setPainted,pause(value:boolean){paused=value;last=0;schedule();},destroy(){
    construction?.arrival.finish();
    meadow?.dispose();
    dead=true;cancelAnimationFrame(frame);observer.disconnect();signals.abort();orbit.dispose();releaseInstances(structures);releaseInstances(scenery);
    for(const p of paths.children)if(p instanceof T.Mesh)p.geometry.dispose();
    const hull=boat.children[0];if(hull instanceof T.Mesh)hull.geometry.dispose();
    beamGeometry.dispose();beamMaterial.dispose();wakeMat.dispose();wakeGeo.dispose();glows.geometry.dispose();glows.material.dispose();valley.dispose();atmosphere.dispose();world.dispose();sea.dispose();gardens.dispose();shop.dispose();renderer.dispose();
  }};
}
