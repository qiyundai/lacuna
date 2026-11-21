import {landHeight,shoreline,laneDepth} from './valley-river.js';
export {landHeight,shoreline} from './valley-river.js';
import * as T from 'three';
import { loadGouache, paintMaterial } from './gouache.js';
import { createHarborBuildings } from './harbor-buildings.js';
import { coastalTrees } from './coastal-flora.js';
import { stirCanopy } from './coastal-breeze.js';
import { reliefNormal } from './surface-relief.js';
import { createFerryHallKit } from './ferry-hall.js';
import { createTideHouseKit } from './tide-house.js';
import { hashPage } from './city-growth.js';
import type { Site } from './painted-coast.js';

const surfaceNames=['cliff','masonry','heath','paving'] as const;
type Skin=typeof surfaceNames[number]|'copper'|'iron'|'lamp'|'bark'|'needle'|'leaf'|'glass'|'cream'|'hull'|'ashlar'|'coping'|'pebble'|'gravel'|'gardenEarth'|'court'|'shingle';
type Part=T.Object3D;

export function sitePoint(s:Site){
  const x=(s.x-900)/12.5;
  const depth=s.kind==='wharf'?-.25:laneDepth(x,s.lane);
  const z=shoreline(x)-depth;return new T.Vector3(x,Math.max(.75,landHeight(x,z)),z);
}
export function siteHeading(site: Site, x: number) {
  const line=(station:number)=>shoreline(station)-(site.kind==='wharf'?0:laneDepth(station,site.lane));
  return -Math.atan(line(x + .5) - line(x - .5)) * .77 + (hashPage(site.id) % 15 - 7) * .014;
}
export async function harborWorkshop(){
  const breezeTime={value:0};
  const textures=new T.TextureLoader();
  const materials={} as Record<Skin,T.MeshStandardMaterial>;
  const loaded=await Promise.all(surfaceNames.map(async name=>{
    const texture=await textures.loadAsync('/city/materials/'+name+'.webp');
    texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;
    const material=new T.MeshStandardMaterial({map:texture,roughness:.91,side:T.DoubleSide});
    materials[name]=material;return texture;
  }));
  for(const [name,color] of Object.entries({ashlar:'#a59282',coping:'#bcad98',copper:'#5b7974',iron:'#3d4350',lamp:'#ffdf95',bark:'#5f4942',needle:'#294b43',leaf:'#557055',glass:'#638787',cream:'#dac5a5',hull:'#334853'})){
    materials[name as Skin]=new T.MeshStandardMaterial({color,roughness:name==='glass'?.28:.78,metalness:name==='copper'?.35:0});
  }
  materials.pebble=new T.MeshStandardMaterial({color:'#a79c91',roughness:.89,vertexColors:true});
  for(const [key,color] of [['court','#e5d7be'],['gardenEarth','#9fce87'],['shingle','#cfbe9e']] as const){
    materials[key]=new T.MeshStandardMaterial({map:key==='gardenEarth'?materials.heath.map:materials.paving.map,color,roughness:.98});
  }
  materials.bark.color.set('#87735a');
  materials.gravel=new T.MeshStandardMaterial({color:'#b7a692',roughness:.97});
  for(const key of ['needle','leaf'] as const){
    materials[key].color.set(key==='needle'?'#668479':'#859d70');
    materials[key].vertexColors=true;materials[key].side=T.DoubleSide;
    stirCanopy(materials[key],breezeTime,key==='needle'?.031:.054);
  }
  materials.lamp.emissive.set('#ffbd66');materials.lamp.emissiveIntensity=2.2;
  materials.ashlar.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 stonePoint;\n'+shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      vec4 blockPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        blockPosition=instanceMatrix*blockPosition;
      #endif
      stonePoint=(modelMatrix*blockPosition).xyz;
    `);
    shader.fragmentShader='varying vec3 stonePoint;\n'+shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      float course=stonePoint.y/.32;
      float bed=abs(fract(course+.5)-.5);
      float along=(stonePoint.x*.91+stonePoint.z*.73)/.72+.5*mod(floor(course),2.);
      float joint=abs(fract(along+.5)-.5);
      float block=smoothstep(.012,.064,bed)*smoothstep(.008,.037,joint);
      float stoneTint=fract(sin(dot(vec2(floor(along),floor(course)),vec2(13.33,71.13)))*4317.);
      diffuseColor.rgb*=mix(.80,.94+.13*stoneTint,block);
      #include <roughnessmap_fragment>
    `).replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      float wall=1.-smoothstep(.35,.8,abs(inverseTransformDirection(normal,viewMatrix).y));
      float footprint=max(fwidth(course),fwidth((stonePoint.x*.91+stonePoint.z*.73)/.72));
      float height=smoothstep(.018,.14,bed)*smoothstep(.012,.09,joint);
      vec3 across=dFdx(-vViewPosition), down=dFdy(-vViewPosition);
      vec3 tangentX=cross(down,normal), tangentY=cross(normal,across);
      float determinant=dot(across,tangentX);
      float jointDepth=.016;
      vec3 gradient=dFdx(height)*tangentX+dFdy(height)*tangentY;
      normal=normalize(normal-jointDepth*wall*(1.-smoothstep(.18,.65,footprint))*
        sign(determinant)*gradient/max(abs(determinant),.0000001));
    `);
  };
  const vault=new T.Shape();
  vault.moveTo(-.5,0);vault.lineTo(-.5,-1);vault.lineTo(-.37,-1);
  vault.absellipse(0,-1,.37,.79,Math.PI,0,true,0);
  vault.lineTo(.5,-1);vault.lineTo(.5,0);vault.closePath();
  const arcade=new T.ExtrudeGeometry(vault,{depth:1,curveSegments:12,bevelEnabled:false});
  arcade.translate(0,0,-.5);
  const geometries={
    arcade,pebble:new T.IcosahedronGeometry(.55,1),box:new T.BoxGeometry(1,1,1),round:new T.CylinderGeometry(.5,.5,1,20),plinth:new T.CylinderGeometry(.48,.5,1,12),
    cone:new T.ConeGeometry(.52,1,12),
    crag:new T.IcosahedronGeometry(.58,1),crown:new T.IcosahedronGeometry(.55,2)
  };
  for (const g of [geometries.cone,geometries.crown]) {
    g.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*3).fill(1),3));
  }
  const grains:number[]=[];
  const pebble=geometries.pebble.getAttribute('position');
  for(let i=0;i<pebble.count;i++){
    const x=pebble.getX(i),y=pebble.getY(i),z=pebble.getZ(i);
    const bend=1+.09*Math.sin(x*6+z*7);
    pebble.setXYZ(i,x*bend+y*.13,y,z);
    const grain=.88+.14*Math.cos(z*17+x*8)+.1*y;
    grains.push(grain,grain*.98,grain*.94);
  }
  geometries.pebble.setAttribute('color',new T.Float32BufferAttribute(grains,3));
  const roughCrown=geometries.crown.getAttribute('position');
  for(let i=0;i<roughCrown.count;i++){
    const x=roughCrown.getX(i),y=roughCrown.getY(i),z=roughCrown.getZ(i);
    const n=1+.12*Math.sin(x*38+y*25)*Math.cos(z*23-y*27)+.09*Math.sin(y*13+x*16);
    roughCrown.setXYZ(i,x*n,y*n,z*n);
  }
  geometries.crown.computeVertexNormals();
  const crag=geometries.crag.getAttribute('position');
  for(let i=0;i<crag.count;i++){
    const x=crag.getX(i),y=crag.getY(i),z=crag.getZ(i);
    const variance=1+.21*Math.sin(x*13+y*7)*Math.cos(z*12-y*11);
    crag.setXYZ(i,x*variance+y*.13,y*variance,z*variance+.12*x);
  }
  geometries.crag.computeVertexNormals();
  function piece(group:Part,g:T.BufferGeometry,skin:Skin,x:number,y:number,z:number,w:number,h:number,d:number,angle=0){
    const m=new T.Mesh(g,materials[skin]);m.position.set(x,y,z);m.scale.set(w,h,d);m.rotation.y=angle;group.add(m);return m;
  }
  const box=(p:Part,k:Skin,x:number,y:number,z:number,w:number,h:number,d:number)=>piece(p,geometries.box,k,x,y,z,w,h,d);
  const pole=(p:Part,k:Skin,x:number,y:number,z:number,w:number,h:number)=>piece(p,geometries.round,k,x,y,z,w,h,w);
  const paint = await loadGouache();
  const forest=coastalTrees(breezeTime,paint);
  const treeModels=forest.trees;
  function tree(p:Part,x:number,y:number,z:number,h:number,seed:number){
    const species=T.MathUtils.euclideanModulo(seed,treeModels.length),instance=treeModels[species]!.clone();
    instance.userData.treeSpecies=species;
    instance.position.set(x,y-.035,z);instance.rotation.y=seed*2.39996;
    const spread=h*(.96+.16*Math.sin(seed));
    instance.scale.set(spread,h,spread);p.add(instance);
  }
  function lantern(p:Part,x:number,y:number,z:number,h=1.15){
    pole(p,'iron',x,y+h*.5,z,.07,h);piece(p,geometries.plinth,'lamp',x,y+h+.1,z,.23,.26,.23);
    piece(p,geometries.cone,'iron',x,y+h+.28,z,.32,.16,.32);
  }
  if(paint?.relief){
    const relief=paint.relief;
    materials.gravel.onBeforeCompile=shader=>{
      shader.uniforms.gravelRelief={value:relief};
      shader.vertexShader='varying vec2 gravelUv;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n gravelUv=uv;');
      shader.fragmentShader='uniform sampler2D gravelRelief; varying vec2 gravelUv;\n'+reliefNormal+shader.fragmentShader.replace('#include <map_fragment>',`
        #include <map_fragment>
        float pebble=texture2D(gravelRelief,gravelUv*1.7).b;
        diffuseColor.rgb*=mix(.66,1.28,pebble);
      `).replace('#include <normal_fragment_maps>',`
        #include <normal_fragment_maps>
        normal=surfaceNormal(normal,-vViewPosition,.073*pebble);
      `);
    };
  }
  if (paint) {
    for (const name of ['leaf','needle'] as const) paintMaterial(materials[name], paint, 'canopy');
    paintMaterial(materials.cliff, paint, 'rock');
    paintMaterial(materials.ashlar, paint);
    paintMaterial(materials.coping, paint);
    paintMaterial(materials.gravel, paint);
    paintMaterial(materials.pebble, paint);
    for(const name of ['gardenEarth','court','shingle'] as const)paintMaterial(materials[name],paint);
    for (const name of ['masonry','copper','bark','cream','hull','iron'] as const) paintMaterial(materials[name], paint, 'architecture', true);
  }
  const buildings = createHarborBuildings(paint);
  let ferryHall: ReturnType<typeof createFerryHallKit> | undefined;
  let tideHouse: ReturnType<typeof createTideHouseKit> | undefined;
  function site(s:Site){
    const g=new T.Group(),seed=hashPage(s.id),w=s.width/16.5;
    const pos=sitePoint(s);g.position.copy(pos);
    g.rotation.y=siteHeading(s,pos.x);
    const k=s.kind;
    if(k==='towers'){
      tideHouse ??= createTideHouseKit(paint);
      g.add(tideHouse.build(7+seed%5+s.lights, seed % 5));
    }else if(k==='wharf'){
      ferryHall ??= createFerryHallKit(paint);
      g.add(s.ferryTerminal ? ferryHall.build(5) : ferryHall.buildLanding());
    }else if(k==='pines'){
      for(let i=0;i<6;i++)tree(g,Math.sin(i*2.4)*w*.33,0,Math.cos(i*2.4)*2,3.1+i%3,seed+i);
    }else{
      g.add(buildings.build(k, seed, w,s.lights));
      if (k === 'terraces' || k === 'crescent' || k === 'glasshouse' || k === 'houses') {
        tree(g,w*.46,0,-2.04,2.36+(seed%10)*.09,seed);
      }
    }
    for(let i=0;i<s.lights;i++)lantern(g,-w*.36+i*1.9,.1,2.5);
    return g;
  }
  function ferry(){
    const g=new T.Group();
    const hull=new T.Shape();hull.moveTo(-1.9,-.52);hull.quadraticCurveTo(-2.42,0,-1.85,.52);hull.lineTo(1.36,.53);hull.quadraticCurveTo(2.07,.38,2.56,0);hull.quadraticCurveTo(2.06,-.41,1.36,-.53);hull.closePath();
    const hullGeometry=new T.ExtrudeGeometry(hull,{depth:.44,bevelEnabled:true,bevelThickness:.08,bevelSize:.08,bevelSegments:2,steps:1});hullGeometry.rotateX(-Math.PI/2);
    const boat=new T.Mesh(hullGeometry,materials.hull);g.add(boat);
    box(g,'cream',-.18,.72,0,3.22,.53,.94);box(g,'copper',-.13,1.04,0,3.46,.12,1.13);
    for(let i=0;i<8;i++)for(const z of [-.48,.48])box(g,i%3?'lamp':'glass',-1.5+i*.36,.77,z,.19,.23,.035);
    box(g,'cream',.83,1.23,0,.95,.37,.73);pole(g,'iron',-.49,1.45,0,.28,.8);return g;
  }
  return {paint,breezeTime,materials,piece,box,pole,tree,treeModels,site,ferry,lantern,geometries,dispose(){
    forest.dispose();
    paint?.dispose();
    tideHouse?.dispose();
    ferryHall?.dispose();
    buildings.dispose();
    for(const g of Object.values(geometries))g.dispose();
    for(const tex of loaded)tex.dispose();for(const m of Object.values(materials))m.dispose();
  }};
}
export type Workshop=Awaited<ReturnType<typeof harborWorkshop>>;
