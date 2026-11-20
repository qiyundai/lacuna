import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { sites, type Trade } from '../../../../shared/river.js';

const models = {
  land: 'bridge_stone tree_oak tree_default_dark tree_pineRoundA tree_detailed_fall rock_smallA rock_largeA flower_yellowA crops_wheatStageB crops_leafsStageB crops_dirtDoubleRow canoe log_stack fence_simple',
  village: 'wall-door wall-window-shutters wall-detail-cross roof-gable roof-high-gable roof-point chimney stall-green stall-red cart lantern watermill',
  folk: 'character-female-a character-male-c character-worker'
};
export const avatars: Record<Trade, string> = { cook: 'character-female-a', grower: 'character-male-c', carrier: 'character-worker' };
export async function loadModels(needed?:ReadonlySet<string>) {
  const loader = new GLTFLoader();
  const library = new Map<string, GLTF>();
  await Promise.all(Object.entries(models).flatMap(([folder, names]) => names.split(' ').filter(name=>!needed||needed.has(name)).map(async name => {
    const model = await loader.loadAsync('/town/' + folder + '/' + name + '.glb');
    model.scene.traverse(node => {
      if (!(node instanceof T.Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!(material instanceof T.MeshStandardMaterial)) continue;
        material.metalness = 0;
        material.roughness = 1;
        const colors: Record<string,string> = { leafsGreen:'#829b53', leafsDark:'#517952', leafsFall:'#bd8747', woodBark:'#896741', woodBarkDark:'#6d5340', stone:'#bab3a2', stoneDark:'#918e80', grass:'#91a268', dirt:'#92846e' };
        if (colors[material.name]) material.color.set(colors[material.name]);
      }
    });
    library.set(name, model);
  })));
  return library;
}
export type Library = Awaited<ReturnType<typeof loadModels>>;
export const riverX = (z: number) => 1.45 * Math.sin(z * .22);
export function ground(x: number, z: number) {
  const distance = Math.abs(x-riverX(z));
  const meadow = .42 + .11*Math.sin(x*.67+z*.3) + .08*Math.cos(z*.72);
  return T.MathUtils.lerp(-.65, meadow, T.MathUtils.smoothstep(distance, 1.85, 3.15));
}
export const plotPoints = sites.map(s=>new T.Vector3((s.x-50)*.32,0,(s.y-50)*.24));
export function waypoint(x:number,z:number) { return new T.Vector3(x, ground(x,z)+.03, z); }
export function route(site:number) {
  const p=plotPoints[site], sign=sites[site].bank ? 1 : -1;
  return [waypoint(p.x,p.z+1.1),waypoint(p.x*.60+sign*1.4,p.z*.74+.6),waypoint(sign*4.1,p.z*.26),waypoint(sign*3.2,0)];
}
function seeded() {
  let state=34021;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
function surface(positions:number[],colors:number[]) {
  const geom=new T.BufferGeometry();
  geom.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geom.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geom.computeVertexNormals();
  const mesh=new T.Mesh(geom,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));
  mesh.receiveShadow=true;
  return mesh;
}
function terrain(){
  const pos:number[]=[],colors:number[]=[],rand=seeded();
  const tri=(a:T.Vector3,b:T.Vector3,c:T.Vector3,color:T.Color)=>{
    for(const v of [a,b,c]) {pos.push(v.x,v.y,v.z);colors.push(color.r,color.g,color.b);}
  };
  const vertices:T.Vector3[][]=[];
  for(let row=0;row<=32;row++){
    const z=(row/32-.5)*24,edge=16-Math.max(0,Math.abs(z)-8)*.65;
    const line:T.Vector3[]=[];
    for(let col=0;col<=44;col++){
      const x=(2*col/44-1)*edge;
      line.push(new T.Vector3(x,ground(x,z),z));
    }
    vertices.push(line);
  }
  for(let j=0;j<32;j++)for(let i=0;i<44;i++){
    const a=vertices[j][i],b=vertices[j][i+1],c=vertices[j+1][i],d=vertices[j+1][i+1];
    const base=new T.Color(a.y<.12?'#c5b384':'#afbd77').offsetHSL(.006*Math.sin(a.z*.5),0,(rand()-.5)*.029+.018*Math.sin(a.x*.8+a.z*.4));
    tri(a,c,b,base);tri(b,c,d,base);
  }
  const rim=[...vertices[0],...vertices.slice(1).map(r=>r[44]),...vertices[32].slice(0,-1).reverse(),...vertices.slice(1,-1).reverse().map(r=>r[0])];
  for(let i=0;i<rim.length;i++){
    const a=rim[i],b=rim[(i+1)%rim.length];
    let prevA=a,prevB=b;
    for(const [depth,shade] of [[-.7,'#b79e72'],[-1.55,'#998162'],[-1.9,'#826e58']] as const){
      const lowA=new T.Vector3(a.x,depth,a.z),lowB=new T.Vector3(b.x,depth,b.z);
      const color=new T.Color(shade).offsetHSL(0,0,(rand()-.5)*.025);
      tri(prevA,prevB,lowA,color);tri(prevB,lowB,lowA,color);
      prevA=lowA;prevB=lowB;
    }
  }
  const land=surface(pos,colors);
  const waterPos:number[]=[],waterColors:number[]=[];
  for(let i=0;i<40;i++){
    const z=-12+i*.6,next=z+.6;
    for(let band=0;band<5;band++){
      const offset=-2.65+band*1.06;
      const a=riverX(z)+offset,b=riverX(next)+offset;
      const shade=new T.Color(['#81aea3','#6a9d9c','#60949a','#6c9e9f','#80ada3'][band]).offsetHSL(0,0,.012*Math.sin(i*.8));
      waterPos.push(a,0,z,b,0,next,a+1.06,0,z,a+1.06,0,z,b,0,next,b+1.06,0,next);
      for(let k=0;k<6;k++)waterColors.push(shade.r,shade.g,shade.b);
    }
  }
  const water=surface(waterPos,waterColors);
  const flecks:number[]=[];
  for(let i=0;i<120;i++){
    const z=rand()*23.7-11.85,x=riverX(z)+(rand()-.5)*4.3;
    const length=.12+rand()*.6;
    flecks.push(x,.008,z,x+.036,.008,z+length*.3,x-.02,.008,z+length);
  }
  const highlights=new T.BufferGeometry();
  highlights.setAttribute('position',new T.Float32BufferAttribute(flecks,3));
  const ripples=new T.Mesh(highlights,new T.MeshBasicMaterial({color:'#b5d5c5',side:T.DoubleSide}));
  return [land,water,ripples];
}
export function trail(points:T.Vector3[],width:number,color:string){
  const path=new T.CatmullRomCurve3(points).getPoints(22),pos:number[]=[];
  const edges=path.map((p,i)=>{
    const tangent=path[Math.min(path.length-1,i+1)].clone().sub(path[Math.max(0,i-1)]).normalize();
    return [-1,1].map(side=>{
      const x=p.x-tangent.z*width*.5*side,z=p.z+tangent.x*width*.5*side;
      return [x,ground(x,z)+.048,z];
    });
  });
  for(let i=1;i<edges.length;i++)pos.push(...edges[i-1][0],...edges[i][0],...edges[i-1][1],...edges[i-1][1],...edges[i][0],...edges[i][1]);
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.computeVertexNormals();
  const mesh=new T.Mesh(geo,new T.MeshStandardMaterial({color,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,roughness:1}));mesh.receiveShadow=true;return mesh;
}
export function model(library:Library,name:string,x:number,y:number,z:number,scale:number,angle=0){
  const object=library.get(name)!.scene.clone();
  object.position.set(x,y,z);object.scale.setScalar(scale);object.rotation.y=angle;
  return object;
}
function cottage(library:Library,roof:string){
  const group=new T.Group();
  for(let i=0;i<4;i++)group.add(model(library,['wall-door','wall-window-shutters','wall-detail-cross','wall-window-shutters'][i],0,0,0,1,i*Math.PI/2));
  group.add(model(library,roof,0,1,0,1),model(library,'chimney',0,.85,.23,.78));
  return group;
}
export function landscape(library:Library){
  const group=new T.Group(),rand=seeded();
  group.add(...terrain());
  const add=(name:string,x:number,z:number,scale:number,angle=0)=>{const item=model(library,name,x,ground(x,z),z,scale,angle);group.add(item);return item;};
  const bridge=model(library,'bridge_stone',0,.15,0,1);
  bridge.scale.set(6.8,2.85,2.05);group.add(bridge);
  const houses=[[-9,-6,2.25,.19],[-12,-3,1.65,-.27],[-6,-8,1.85,.15],[-11,2,1.55,.42],[8,-8,1.65,-.48],[11,-6.6,2.15,-.32],[12,2.5,1.7,.4],[6,7.7,1.55,-.45]];
  houses.forEach(([x,z,s,a],i)=>{
    const h=cottage(library,i%3===0?'roof-high-gable':i%3===1?'roof-point':'roof-gable');
    h.scale.set(s*1.3,s*.86,s);h.rotation.y=a;h.position.set(x,ground(x,z),z);group.add(h);
    const side=x>0?1:-1;
    const laneEnd=side*(4.4+.18*Math.abs(z));
    group.add(trail([waypoint(x,z+1),waypoint(x+side*.22,z+1.6),waypoint((x+laneEnd)*.5,z+1.9),waypoint(laneEnd,z+1)],.64,'#cabb92'));
    add('fence_simple',x-.85,z+1.35,1.1,a);add('flower_yellowA',x+.65,z+1.1,1.1);
  });
  for(const side of [-1,1]){
    group.add(trail([waypoint(side*5.8,-7.2),waypoint(side*5.4,-4),waypoint(side*4.3,-1.1),waypoint(side*3.25,0)],.83,'#cabb92'));
    group.add(trail([waypoint(side*5.9,9),waypoint(side*5.4,5.8),waypoint(side*4.4,2.6),waypoint(side*3.25,0)],.83,'#cabb92'));
  }
  const wheel=add('watermill',-3.12,-4.6,1.35);
  const mill=cottage(library,'roof-gable');mill.scale.set(2.2,1.9,2.5);mill.position.set(-4.7,ground(-4.7,-4.6),-4.6);group.add(mill);
  wheel.position.y+=.6;
  add('canoe',riverX(5)+1.75,5,1.85,.1).position.y=.04;
  for(let i=0;i<130;i++){
    const x=(rand()-.5)*30,z=(rand()-.5)*22;
    if(Math.abs(x-riverX(z))<3.4 || (Math.abs(x)<12.7 && Math.abs(z)<8.8) || houses.some(([hx,hz])=>Math.hypot(hx-x,hz-z)<1.9) || plotPoints.some(p=>Math.hypot(p.x-x,p.z-z)<2.1))continue;
    add(['tree_oak','tree_default_dark','tree_pineRoundA','tree_detailed_fall'][i%4],x,z,2.1+rand()*1.6,rand()*6.28);
  }
  for(let i=0;i<76;i++){
    const z=rand()*23-11.5,side=i%2?1:-1;
    if(Math.abs(z)<1.4)continue;
    const x=riverX(z)+side*(1.8+rand()*1.1);
    add(i%8===0?'rock_largeA':'rock_smallA',x,z,.55+rand(),rand()*6);
  }
  for(let i=0;i<52;i++){
    const x=(rand()-.5)*28,z=(rand()-.5)*20;
    if(Math.abs(x-riverX(z))>3.8) add('flower_yellowA',x,z,.62+rand()*.45,rand()*6);
  }
  return group;
}
export function workplace(library:Library,site:number,trade:Trade,workers:number){
  const group=new T.Group(),p=plotPoints[site];
  group.position.set(p.x,ground(p.x,p.z),p.z);
  const piece=(name:string,x:number,z:number,s:number,angle=0)=>group.add(model(library,name,x,0,z,s,angle));
  if(trade==='cook'){
    piece('stall-red',0,0,1.85,.18);piece('lantern',1.3,.6,.9);
  }else if(trade==='grower'){
    for(let row=0;row<3;row++){
      const earth=model(library,'crops_dirtDoubleRow',0,0,(row-1)*.77,1);
      earth.scale.set(3,.55,.72);group.add(earth);
      for(let col=0;col<6;col++)piece(row===2?'crops_leafsStageB':'crops_wheatStageB',(col-2.5)*.51,(row-1)*.77,1.8);
    }
    piece('fence_simple',-1.48,0,1.6,Math.PI/2);
  }else{
    piece('stall-green',-.4,-.3,1.48,-.2);piece('cart',.75,.55,1.18,.4);piece('log_stack',-1.12,.9,.8);
  }
  if(workers>1)piece('cart',1.5,-.85,.93,1.5);
  return group;
}
