import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { cityFromPages } from './city-growth.js';

type Plan = ReturnType<typeof cityFromPages>;
const size = 8;
const names = ['a','c','e','g','j','l','n','skyscraper-a','skyscraper-b','skyscraper-c','skyscraper-e'];

const facadeVertex = `
varying vec3 local;varying vec3 face;varying vec3 world;
void main(){local=position;face=normalize(mat3(modelMatrix)*normal);vec4 pos=modelMatrix*vec4(position,1.);world=pos.xyz;gl_Position=projectionMatrix*viewMatrix*pos;}`;
const facadeFragment = `
varying vec3 local;varying vec3 face;varying vec3 world;
float hash(vec2 p){return fract(sin(dot(p,vec2(31.17,78.23)))*4375.751);}
void main(){
 vec3 n=normalize(face);float seed=hash(floor((world.xz-local.xz*2.)/8.+.5));
 float light=max(dot(n,normalize(vec3(-.6,.8,.25))),0.);
 vec3 wall=mix(vec3(.033,.055,.087),vec3(.18,.083,.063),seed)*(.42+light*1.45);
 vec2 grid=vec2((abs(n.x)>.55?world.z:world.x)*3.1,world.y*2.32);
 vec2 cell=floor(grid);vec2 q=fract(grid);
 float window=smoothstep(.10,.23,q.x)*(1.-smoothstep(.72,.86,q.x))*smoothstep(.17,.32,q.y)*(1.-smoothstep(.67,.79,q.y));
 float random=hash(cell+floor(world.xz*.1));
 vec3 glow=mix(vec3(.53,.53,.43),vec3(1.13,.64,.24),hash(cell+21.));
 wall=mix(wall,vec3(.058,.104,.15),window*.62);
 wall+=window*glow*smoothstep(.49,.82,random)*(.81+.31*sin(cell.y));
 if(abs(n.y)>.48)wall=mix(vec3(.067,.078,.116),vec3(.22,.15,.13),light*.8);
 float fog=1.-exp(-.00065*distance(cameraPosition,world));
 gl_FragColor=vec4(mix(wall,vec3(.22,.16,.25),fog),1.);
 #include <colorspace_fragment>
}`;

export async function createCity(canvas: HTMLCanvasElement) {
  const loader = new GLTFLoader();
  const models = await Promise.all(names.map(async name => {
    const {scene} = await loader.loadAsync('/city/building-'+name+'.glb');
    const parts:T.BufferGeometry[]=[];
    scene.updateMatrixWorld(true);
    scene.traverse(node=>{
      if(node instanceof T.Mesh){
        parts.push(node.geometry.clone().applyMatrix4(node.matrixWorld));
        node.geometry.dispose();
        for(const material of [node.material].flat()){material.map?.dispose();material.dispose();}
      }
    });
    const geometry=mergeGeometries(parts)!;
    for(const part of parts)part.dispose();
    geometry.computeBoundingBox();
    const bounds=geometry.boundingBox!,center=bounds.getCenter(new T.Vector3()),extent=bounds.getSize(new T.Vector3());
    geometry.translate(-center.x,-bounds.min.y,-center.z);
    const width=Math.max(extent.x,extent.z);
    geometry.scale(1/width,1/width,1/width);
    return geometry;
  }));
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(33,1,.2,1700);
  const controls=new OrbitControls(camera,canvas);
  controls.enablePan=false;controls.minPolarAngle=.6;controls.maxPolarAngle=1.49;
  controls.rotateSpeed=.55;controls.zoomSpeed=.65;
  const sky=await new T.TextureLoader().loadAsync('/city/afterglow.webp');
  sky.mapping=T.EquirectangularReflectionMapping;sky.colorSpace=T.SRGBColorSpace;
  scene.background=sky;
  scene.backgroundRotation.y=.5;
  const waterGeom=new T.PlaneGeometry(1500,1500);
  const water=new Reflector(waterGeom,{textureWidth:640,textureHeight:360,multisample:0,clipBias:.003,color:0xffffff});
  const waterMat=water.material as T.ShaderMaterial;
  waterMat.uniforms.clock={value:0};
  waterMat.vertexShader='varying vec2 surface;'+waterMat.vertexShader.replace('vUv =','surface=position.xy; vUv =');
  waterMat.fragmentShader=`varying vec2 surface;varying vec4 vUv;uniform sampler2D tDiffuse;uniform float clock;
  void main(){vec2 uv=vUv.xy/vUv.w;float t=clock*.48;
  float waves=sin(surface.y*3.+surface.x*.18+t)+.52*sin(surface.y*7.3-surface.x*.33-t)+.3*sin(surface.x*1.4+surface.y*4.2+t);
  vec3 reflected=texture2D(tDiffuse,uv+vec2(.0028*waves,.0020*sin(surface.x+waves))).rgb;
  float detail=1.-smoothstep(.13,1.1,length(fwidth(surface)));
  vec3 c=reflected*vec3(.24,.33,.48)+vec3(.012,.031,.052)+.0028*waves*detail;
  gl_FragColor=vec4(c,1.);
  #include <colorspace_fragment>
  }`;
  water.rotateX(-Math.PI/2);water.position.y=-.24;scene.add(water);
  scene.add(new T.HemisphereLight(0xffdfd3,0x6c7993,1.9));
  const sun=new T.DirectionalLight(0xffc49d,2.3);sun.position.set(-40,45,24);scene.add(sun);
  const box=new T.BoxGeometry(1,1,1);
  const mat=(color:string)=>new T.MeshStandardMaterial({color,roughness:1});
  const quay=mat('#595368'),paving=mat('#807a79'),road=mat('#46434b'),copper=mat('#7d6058'),green=mat('#495c50');
  const lamp=new T.MeshBasicMaterial({color:'#ffe0a1'}),tramPaint=mat('#bd7655');
  const facade=new T.ShaderMaterial({vertexShader:facadeVertex,fragmentShader:facadeFragment});
  const coastGeometry=new T.PlaneGeometry(330,110,188,66);
  coastGeometry.rotateX(-Math.PI/2);
  const positions=coastGeometry.getAttribute('position'),colors:number[]=[],grove:T.Vector3[]=[];
  const terrainColor=new T.Color();
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),depth=(positions.getZ(i)+55)/110;
    const edge=-3.4+.053*x*x/(1+Math.abs(x)*.033)+3.2*Math.sin(x*.103)+1.6*Math.sin(x*.31);
    const z=edge-depth*110;
    const fold=Math.sin(x*.14+depth*5)*.5+Math.sin(x*.42-z*.31)*.31+Math.cos(z*.91)*.19;
    const h=-.54+Math.min(1,depth*18)*(.44+fold*.12)+Math.max(0,depth-.22)*(4.6+fold*2.8)-Math.max(0,depth-.63)*19-Math.pow(Math.abs(x)/150,5)*5;
    positions.setXYZ(i,x,h,z);
    if(z< -13 && h>-.07 && depth<.8 && fold>.05 && Math.sin(i*112.16)>-.4)grove.push(new T.Vector3(x,h,z));
    terrainColor.set(depth<.041?'#665864':'#424f4d').multiplyScalar(.64+fold*.19+depth*.05);
    colors.push(terrainColor.r,terrainColor.g,terrainColor.b);
  }
  coastGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));coastGeometry.computeVertexNormals();
  const coastMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide});
  scene.add(new T.Mesh(coastGeometry,coastMaterial));
  const {scene:oak}=await loader.loadAsync('/town/land/tree_oak.glb');
  const woods:T.InstancedMesh[]=[];
  oak.updateMatrixWorld(true);
  oak.traverse(node=>{
    if(!(node instanceof T.Mesh))return;
    const isLeaf=node.material.name==='leafsGreen';
    const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld);
    const trees=new T.InstancedMesh(geometry,isLeaf?green:copper,grove.length);
    const stem=new T.Object3D();
    grove.forEach((pos,i)=>{
      const height=1.3+.7*Math.sin(i*443.23)+.6*(1+Math.sin(pos.x*.12));
      stem.position.copy(pos);stem.scale.setScalar(height);stem.rotation.y=i*.29;stem.updateMatrix();
      trees.setMatrixAt(i,stem.matrix);
    });
    woods.push(trees);scene.add(trees);node.geometry.dispose();node.material.dispose();
  });
  const root=new T.Group();scene.add(root);
  const known=new Map<string,{group:T.Group;levels:number}>();
  const vehicles:{mesh:T.Object3D;x:number;z:number;phase:number}[]=[];
  const tracks=new T.Group(),train=new T.Group();scene.add(tracks,train);
  for(let i=0;i<3;i++){
    slab(train,copper,i*1.62,1.60,0,1.56,.48,.44);
    slab(train,lamp,i*1.62,1.68,0,1.34,.15,.46);
    slab(train,road,i*1.62,1.88,0,1.5,.08,.46);
  }
  let line:{x:number;z:number;length:number}|null=null;
  function transit(blocks:Plan['blocks']){
    const sites=new Set(blocks.map(b=>b.x+','+b.z));let longest=0;line=null;tracks.clear();
    for(const b of blocks){
      if(sites.has((b.x-1)+','+b.z))continue;
      let run=1;while(sites.has((b.x+run)+','+b.z))run++;
      if(run<3||run<=longest)continue;
      longest=run;line={x:b.x*size-size*.42,z:b.z*size-3.6,length:run*size-1.25};
    }
    train.visible=!!line;
    if(line){
      slab(tracks,quay,line.x+line.length/2,1.29,line.z,line.length,.29,.69);
      for(let x=1;x<line.length;x+=4)slab(tracks,quay,line.x+x,.67,line.z,.25,1.22,.52);
    }
  }
  let pulse:{group:T.Group;age:number}|null=null;
  function slab(group:T.Object3D,material:T.Material,x:number,y:number,z:number,w:number,h:number,d:number){
    const mesh=new T.Mesh(box,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);group.add(mesh);return mesh;
  }
  function plant(group:T.Object3D,x:number,z:number,h:number){
    for(const part of woods){
      const tree=new T.Mesh(part.geometry,part.material);tree.position.set(x,.22,z);tree.scale.setScalar(h);tree.rotation.y=x+z;group.add(tree);
    }
  }
  function building(group:T.Object3D,index:number,x:number,z:number,width:number,height:number,rotate:number){
    const mesh=new T.Mesh(models[index],facade);mesh.position.set(x,.24,z);mesh.scale.set(width,height,width);mesh.rotation.y=rotate;group.add(mesh);return mesh;
  }
  function build(block:Plan['blocks'][number],order:number){
    const group=new T.Group();
    group.position.set(block.x*size,0,block.z*size);
    const seed=block.seed;
    slab(group,quay,0,-.17,0,8,.58,8);slab(group,road,0,.13,0,8,.08,8);
    slab(group,paving,0,.2,0,6.94,.12,6.94);
    if(block.green){
      slab(group,green,0,.28,0,5.8,.08,5.8);
      for(let i=0;i<7;i++) plant(group,(i%3-1)*1.8,(Math.floor(i/3)-1)*1.8,1.9+(i%3)*.32);
    }else{
      const high=order>0 && (seed%4===0 || order%9===4);
      const index=high?7+seed%4:seed%7;
      building(group,index,-1.17,-.99,3.94,(high?4.5:3.65)*(1+(block.levels-1)*.44),(seed%4)*Math.PI/2);
      building(group,(seed>>>8)%7,2.06,1.16,2.17,2.2+(seed%3)*.4,Math.PI/2);
      building(group,(seed>>>11)%7,-1.55,2.34,2.05,1.95,0);
      plant(group,2.24,-2.35,1.5);
    }
    for(const x of [-3.4,3.4]){
      slab(group,copper,x,.63,3.44,.075,.84,.075);
      slab(group,lamp,x,1.07,3.44,.18,.09,.16);
    }
    if(order%3===0){
      const mesh=new T.Group();
      slab(mesh,tramPaint,0,.31,0,1.32,.32,.36);slab(mesh,lamp,0,.46,0,.99,.09,.37);
      vehicles.push({mesh,x:block.x*size,z:block.z*size+3.76,phase:seed%93});root.add(mesh);
    }
    root.add(group);return group;
  }
  let paused=false,alive=true,dirty=true,seconds=0,frame=0,last=0,plan:Plan={blocks:[],latest:undefined},range=0,initialized=false;
  const horizon=new T.Vector3(),offset=new T.Vector3(.46,.227,1.3).normalize();
  function fit(force:boolean){
    const bounds=new T.Box3();
    for(const b of plan.blocks)bounds.expandByPoint(new T.Vector3(b.x*size,0,b.z*size));
    const center=bounds.isEmpty()?new T.Vector3():bounds.getCenter(new T.Vector3());
    const span=bounds.isEmpty()?new T.Vector3():bounds.getSize(new T.Vector3());
    const distance=Math.max(29,(Math.hypot(span.x,span.z)+13)*(.63+.85/Math.min(camera.aspect,2.4)));
    center.y=plan.blocks.length>4?5.0:1.7;
    if(force||!initialized)horizon.copy(offset);else horizon.copy(camera.position).sub(controls.target).normalize();
    const zoom=force||!range?1:T.MathUtils.clamp(camera.position.distanceTo(controls.target)/range,.56,1.5);
    range=distance;controls.minDistance=Math.max(20,range*.46);controls.maxDistance=range*1.8;
    controls.target.copy(center);camera.position.copy(center).addScaledVector(horizon,range*zoom);controls.update();dirty=true;
  }
  function clear(){
    pulse=null;root.clear();known.clear();vehicles.length=0;
  }
  function update(next:Plan,reveal=false){
    if(next.blocks.length<plan.blocks.length || next.blocks.some((b,i)=>i<plan.blocks.length && (b.seed!==plan.blocks[i]?.seed||b.levels<plan.blocks[i]!.levels)))clear();
    if(pulse){pulse.group.scale.y=1;pulse=null;}
    plan=next;
    for(const [index,b] of next.blocks.entries()){
      const key=b.x+','+b.z,previous=known.get(key);
      if(previous?.levels===b.levels)continue;
      if(previous){
        const main=previous.group.children[3];
        if(main)main.scale.y*= (1+(b.levels-1)*.44)/(1+(previous.levels-1)*.44);
        previous.levels=b.levels;
      }else known.set(key,{group:build(b,index),levels:b.levels});
      if(reveal && !paused && b===next.latest)pulse={group:known.get(key)!.group,age:previous ? .72 : 0};
    }
    transit(next.blocks);fit(!initialized);initialized=next.blocks.length>0;dirty=true;
  }
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();fit(false);
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  const changed=()=>{dirty=true;};
  controls.addEventListener('change',changed);
  function draw(now:number){
    if(!alive)return;
    frame=requestAnimationFrame(draw);
    const dt=Math.min(.07,(now-last)/1000);last=now;
    if(document.hidden || (paused&&!dirty))return;
    if(!paused)seconds+=dt;
    if(pulse){
      pulse.age+=dt*.81;const fraction=paused?1:Math.min(1,pulse.age);
      pulse.group.scale.y=Math.max(.01,1-Math.pow(1-fraction,2));
      if(fraction>=1)pulse=null;
    }
    for(const v of vehicles){const t=(seconds*.12+v.phase*.17)%2;v.mesh.position.set(v.x+(1-Math.abs(t-1))*6.7-3.35,.02,v.z);}
    if(line){
      const fraction=(1-Math.cos(seconds*.092+.67))*.5;
      train.position.set(line.x+fraction*(line.length-4),0,line.z);
    }
    waterMat.uniforms.clock!.value=seconds;
    renderer.render(scene,camera);dirty=false;
  }
  resize();frame=requestAnimationFrame(draw);
  return {update,pause(value:boolean){paused=value;dirty=true;},destroy(){
    alive=false;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();clear();
    for(const g of [...models,box,waterGeom,coastGeometry])g.dispose();
    for(const m of [quay,paving,road,copper,green,lamp,tramPaint,facade,coastMaterial])m.dispose();
    for(const trees of woods){trees.dispose();trees.geometry.dispose();}
    water.dispose();sky.dispose();renderer.dispose();
  }};
}
