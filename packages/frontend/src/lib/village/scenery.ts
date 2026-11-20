import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function combine(parent:T.Object3D) {
  const batches=new Map<T.Material,T.BufferGeometry[]>();
  for(const node of [...parent.children]){
    if(!(node instanceof T.Mesh) || node instanceof T.InstancedMesh || Array.isArray(node.material))continue;
    node.updateMatrix();
    let geo:T.BufferGeometry=node.geometry.clone();
    if(geo.index){const previous=geo;geo=geo.toNonIndexed();previous.dispose();}
    geo.applyMatrix4(node.matrix);
    for(const attr of Object.keys(geo.attributes)) if(!['position','uv','normal','color'].includes(attr))geo.deleteAttribute(attr);
    const batch=batches.get(node.material) ?? [];batch.push(geo);batches.set(node.material,batch);node.removeFromParent();
  }
  batches.forEach((geometries,mat)=>{
    const geo=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
    if(geo){const mesh=new T.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);}
  });
}

export function buildLane(scene:T.Scene, atlas=false) {
  let seed=1482;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  const disposables:T.Texture[]=[];
  const materials=new Map<string,T.MeshStandardMaterial>();
  const box=new T.BoxGeometry(1,1,1);
  function material(color:string) {
    if(!materials.has(color)) materials.set(color,new T.MeshStandardMaterial({color,roughness:.86}));
    return materials.get(color)!;
  }
  function piece(geometry:T.BufferGeometry,x:number,y:number,z:number,mat:T.Material,parent:T.Object3D=scene) {
    const mesh=new T.Mesh(geometry,mat);
    mesh.position.set(x,y,z);mesh.receiveShadow=true;mesh.castShadow=true;
    parent.add(mesh);return mesh;
  }
  function block(x:number,y:number,z:number,w:number,h:number,d:number,color:string,parent:T.Object3D=scene) {
    const mesh=piece(box,x,y,z,material(color),parent);
    mesh.scale.set(w,h,d);return mesh;
  }
  function surface(kind:'wood'|'earth'|'mat'|'stone',base:string) {
    const c=document.createElement('canvas');c.width=c.height=256;
    const ctx=c.getContext('2d')!;ctx.fillStyle=base;ctx.fillRect(0,0,256,256);
    for(let i=0;i<4200;i++){
      ctx.fillStyle=random()>.48?'rgba(255,238,198,.12)':'rgba(24,31,28,.13)';
      const x=random()*256,y=random()*256;
      ctx.fillRect(x,y,kind==='wood'?random()*85:kind==='mat'?random()*18:random()*5,kind==='stone'?random()*4:1);
    }
    if(kind==='mat') for(let y=0;y<256;y+=3){ctx.fillStyle='rgba(58,48,29,.14)';ctx.fillRect(0,y,256,1);}
    const map=new T.CanvasTexture(c);map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;
    disposables.push(map);materials.set(kind,new T.MeshStandardMaterial({map,roughness:.88}));
  }
  surface('wood','#805f45');surface('earth','#97916e');surface('mat','#c1ad7c');surface('stone','#7d8278');
  const loader=new T.TextureLoader();
  function painted(name:string,file:string,repeatX=1,repeatY=1) {
    const texture=loader.load('/town/'+file+'.webp');
    texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;
    texture.repeat.set(repeatX,repeatY);texture.anisotropy=4;disposables.push(texture);
    materials.set(name,new T.MeshStandardMaterial({map:texture,roughness:.92}));
  }
  painted('wood','cedar');
  painted('tiles','ceramic',3,1);
  painted('indigo wall','plaster-indigo');painted('russet wall','plaster-russet');
  const dirt=materials.get('earth')!;
  dirt.map!.repeat.set(58,26);
  const bough=loader.load('/town/maple.webp');bough.colorSpace=T.SRGBColorSpace;disposables.push(bough);
  const boughMaterial=new T.MeshLambertMaterial({map:bough,alphaTest:.44,side:T.DoubleSide,color:'#e1e7cb'});
  const wind={value:1.7};
  boughMaterial.onBeforeCompile=shader=>{
    shader.uniforms.wind=wind;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',
      '#include <common>\nuniform float wind; varying float leafLight;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec3 center=instanceMatrix[3].xyz;
      float gust=sin(wind*.64+center.x*.52+center.z*.31);
      transformed.x+=gust*uv.y*.044;
      transformed.y+=cos(wind*.56+center.z)*uv.x*.027;
      leafLight=smoothstep(-.5,1.0,sin(center.x*.49+center.z*.35)+gust*.20);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float leafLight;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      diffuseColor.rgb*=mix(vec3(.68,.91,.89),vec3(1.32,1.09,.75),leafLight);
    `);
  };
  dirt.onBeforeCompile=shader=>{
    shader.uniforms.wind=wind;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 soilPosition;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nsoilPosition=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float wind; varying vec3 soilPosition;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec2 p=soilPosition.xz;
      float grain=sin(p.x*1.1+sin(p.y*.94))*cos(p.y*1.47+p.x*.65);
      float moss=smoothstep(.65,3.7,abs(p.x+.76*sin(p.y*.27)));
      diffuseColor.rgb*=mix(vec3(1.04,.95,.78),vec3(.58,.81,.64),moss*(.75+.25*grain));
      float dapple=sin(p.x*3.4+sin(p.y*2.5+wind*.17))*cos(p.y*2.0+p.x);
      float canopyShade=1.0-smoothstep(1.0,6.0,length(p-vec2(-3.4,-4.8)));
      diffuseColor.rgb*=1.0-canopyShade*.30*smoothstep(-.5,.65,dapple);
    `);
  };
  const canopy=new T.PlaneGeometry(1,1);
  const boughs:T.Matrix4[]=[];
  function beam(a:T.Vector3,b:T.Vector3,width:number,color:string) {
    const mid=a.clone().lerp(b,.5), mesh=block(mid.x,mid.y,mid.z,width,a.distanceTo(b),width,color);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());
    return mesh;
  }
  const point=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
  function lattice(x:number,y:number,z:number,w:number,h:number,parent:T.Object3D=scene) {
    block(x,y,z,w,h,.075,'#e4cd9d',parent);
    for(let i=0;i<=6;i++) block(x-w/2+i*w/6,y,z-.06,.027,h,.06,'#74563d',parent);
    for(let i=0;i<=6;i++)block(x-w/2+i*w/6,y,z+.057,.027,h,.056,'#74563d',parent);
    for(let j=0;j<=4;j++)block(x,y-h/2+j*h/4,z+.058,w,.031,.056,'#74563d',parent);
    for(let j=0;j<=4;j++) block(x,y-h/2+j*h/4,z-.062,w,.031,.06,'#74563d',parent);
  }
  function roof(x:number,z:number,w:number,d:number,y:number,parent:T.Object3D=scene) {
    const rise=d*.26;
    for(const sign of [-1,1]){
      const slope=Math.atan2(rise,d/2),length=Math.hypot(d/2,rise);
      const plane=block(x,y+rise/2,z+sign*d/4,w,.18,length,'tiles',parent);
      plane.rotation.x=sign*slope;
      for(let j=0;j<5;j++){
        const f=j/5;
        block(x,y+rise*f,z+sign*(d/2)*(1-f),w+.06,.09,.14,'#56615b',parent);
      }
    }
    block(x,y+rise+.08,z,w+.15,.16,.24,'#384746',parent);
  }
  function cottage(x:number,z:number,w:number,d:number,wall:string,cloth:string,parent:T.Object3D=scene) {
    block(x,1.36,z,w,2.72,d,wall,parent);
    const face=cloth==='#a36349'||cloth==='#98634e'?'russet wall':'indigo wall';
    block(x,1.38,z+d/2+.02,w,2.75,.08,face,parent);
    for(const side of [-1,1])block(x+side*w/2,1.36,z,.08,2.74,d,face,parent);
    for(const side of [-1,1])block(x+side*(w/2-.045),1.4,z+d/2+.075,.12,2.8,.14,'wood',parent);
    block(x,.16,z+d/2+.48,w+.3,.25,1.0,'wood',parent);
    roof(x,z,w+1.5,d+1.8,2.9,parent);
  }
  const nearBank=block(0,-.3,5,100,.55,39,'earth');
  const farBank=block(0,-.36,atlas?-123.6:-48,100,.62,atlas?200:49,atlas?'earth':'#78876b');
  const stone=new T.DodecahedronGeometry(1,0);
  for(let i=0;i<155;i++){
    const x=(random()-.5)*78,side=i%2,z=side?-14.4:-23.7;
    const rock=piece(stone,x,-.19,z+random()*.55,material(i%3?'stone':'#687160'));
    rock.scale.set(.4+random()*.6,.22+random()*.42,.45+random()*.5);rock.rotation.y=random()*6;
  }
  for(let i=0;i<23;i++){
    const z=1-i*.73;
    const slab=piece(stone,Math.sin(i*.26)*.84,.015,z,material(i%3?'#96958a':'#82867d'));
    slab.scale.set(.75+random()*.26,.06,.44);slab.rotation.y=random()*.4;
  }
  for(const x of [-4.6,4.6])block(x,1.61,3.2,.2,3.22,6.5,'#a99b7c');
  block(0,1.63,6.45,9.3,3.26,.2,'#b9a98c');
  block(0,3.32,3,10.8,.23,8.6,'wood');
  roof(0,3,10.9,8.8,3.5);
  for(let i=0;i<8;i++)block(-4.25+i*1.22,3.19,2.7,.13,.22,8,'#493e30');
  for(let i=0;i<5;i++){
    for(let j=0;j<3;j++){
      block(-3.65+i*1.83,.105,1.1+j*1.84,1.8,.17,1.81,'mat');
      block(-4.55+i*1.83,.199,1.1+j*1.84,.055,.025,1.82,'#525e4a');
    }
  }
  for(let i=0;i<12;i++)block(0,.125,-.19-i*.13,9.5,.2,.125,'wood');
  for (const x of [-4.55,-2.95,2.95,4.55])block(x,1.66,-.13,.16,3.32,.17,'#59422e');
  for(const x of [-3.78,3.78]) lattice(x,1.62,-.08,1.48,2.91);
  const door=new T.Group();scene.add(door);
  lattice(0,1.61,0,1.55,2.88,door);door.position.set(1.95,0,-.08);
  block(0,2.98,-.22,9.5,.29,.23,'wood');
  painted('valley scroll','valley-painting');
  block(.75,1.85,6.29,.99,1.66,.055,'#69796d');
  block(.75,1.87,6.245,.80,1.18,.025,'#e2d1aa');
  block(.75,1.88,6.22,.66,.83,.018,'valley scroll');
  for(const y of [1.0,2.7])block(.75,y,6.25,1.10,.044,.08,'#513c2b');
  block(-2.55,.50,5.88,2.45,.14,.62,'wood');
  for(const x of [-3.61,-1.49])block(x,.35,5.88,.13,.41,.48,'wood');
  const vaseProfile=[[.07,0],[.14,.06],[.155,.17],[.08,.29],[.065,.36],[.08,.37]].map(([x,y])=>new T.Vector2(x,y));
  piece(new T.LatheGeometry(vaseProfile,22),-3.10,.58,5.88,material('#57766e'));
  for(let i=0;i<4;i++){
    const tip=point(-3.08+(i-1.5)*.17,1.32+(i%2)*.14,5.85+(i%2)*.09);
    beam(point(-3.10,.91,5.88),tip,.014,'#665a44');
    const bloom=piece(stone,tip.x,tip.y,tip.z,material('#cbac81'));bloom.scale.set(.045,.025,.036);
  }
  for(let i=0;i<3;i++)block(-1.92,.61+i*.075,5.82,.43+i*.04,.055,.32,i%2?'#647c75':'#a17a58');
  for(let i=0;i<5;i++)block(-4.46,1.38,1.0+i*1.08,.075,2.62,1.04,'russet wall');
  block(-1.35,.24,3.87,1.18,.14,.76,'#637371');
  block(.02,.73,2.47,.19,.045,.29,'#384741');
  const brush=block(-.23,.736,2.83,.52,.023,.027,'#493c2e');brush.rotation.y=-.29;
  const desk=block(-1.36,.63,2.64,2.75,.14,1.24,'wood');
  for(const x of [-2.53,-.19]) for(const z of [2.14,3.14])block(x,.4,z,.14,.61,.13,'#574634');
  const book=block(-1.16,.725,2.68,.78,.05,.52,'#e8dbb6');
  for(const x of [-1.37,-.98])for(let i=0;i<6;i++)block(x,.754,2.52+i*.052,.22+(i%3)*.019,.004,.009,'#978e73');
  block(-1.15,.758,2.68,.014,.008,.52,'#9e9277');
  const cup=piece(new T.CylinderGeometry(.105,.087,.14,24),-2.13,.77,2.65,material('#4e6763'));
  piece(new T.CircleGeometry(.09,20),cup.position.x,.843,cup.position.z,material('#574030')).rotation.x=-Math.PI/2;
  function lamp(x:number,y:number,z:number,s=1) {
    const light=material('#ffcc80');light.emissive.setHex(0xffb866);light.emissiveIntensity=.90;
    const paper=piece(new T.SphereGeometry(.24,20,12),x,y,z,light);paper.scale.set(s,s*1.38,s);
    for(const f of [-1,-.62,0,.62,1]) {
      const r=.24*Math.sqrt(1-Math.min(.9,f*f));
      const ring=piece(new T.TorusGeometry(r*s,.009*s,4,24),x,y+f*.305*s,z,material('#815d3b'));ring.rotation.x=Math.PI/2;
    }
    block(x,y+.51*s,z,.018,.42*s,.018,'#645742');
  }
  lamp(-2.8,2.2,.1,1.25);lamp(3.58,2.1,-.85);
  for(const x of [.4,2.5])block(x,.45,-5.6,.12,.9,.12,'wood');
  block(1.45,.90,-5.6,2.28,.09,.12,'wood');
  if(!atlas){
    cottage(-7,-9,4.8,3.2,'#d0c0a1','#687a7a');
    cottage(7,-8,5.3,3.6,'#c0ac89','#a36349');
  }
  for(let i=0;i<6;i++) if(!atlas || i===1 || i===4) cottage(-24+i*9,-28-(i%3)*2,4.6+(i%2),3.3,'#c7bf9c',i%2?'#98634e':'#667e77');
  for(let z=-14;z>=-24;z-=.28) block(3.7,.17,z,2.25,.21,.265,'wood');
  for(const x of [2.53,4.86]){
    block(x,1.0,-19,.09,.1,10.7,'#725847');
    for(let i=0;i<6;i++)block(x,.60,-14-i*2,.14,1.25,.14,'#584735');
  }
  const trunk=new T.CylinderGeometry(.11,.2,1,9);
  const temp=new T.Object3D();
  function tree(x:number,z:number,height:number) {
    const stem=piece(trunk,x,height*.44,z,material('#695c48'));stem.scale.set(height*.38,height*.88,height*.38);
    for(let i=0;i<7;i++){
      const a=random()*6.28,d=(.18+random()*.16)*height,ly=height*(.62+random()*.33);
      const lx=x+Math.cos(a)*d,lz=z+Math.sin(a)*d;
      beam(point(x,height*.40,z),point(lx,ly,lz),height*.029,'#6f644d');
      for(let j=0;j<8;j++){
        temp.position.set(lx+(random()-.5)*height*.36,ly+(random()-.5)*height*.15,lz+(random()-.5)*height*.38);
        temp.scale.set(height*(.37+random()*.18),height*(.22+random()*.12),1);
        temp.rotation.set((random()-.5)*.85,random()*6.28,(random()-.5)*.55);
        temp.updateMatrix();boughs.push(temp.matrix.clone());
      }
    }
  }
  for(const [x,z,h] of [[-4,-4.4,4.7],[6,-2.4,3.9],[-9,-3,5],[9,-13,6],[-5,-13,4.1],[14,-6,5.3]])tree(x!,z!,h!);
  for(let i=0;i<22;i++)tree((i-11)*3.7,(atlas?-63:-33)-random()*8,4+random()*5);
  const paintedLeaves=new T.InstancedMesh(canopy,boughMaterial,boughs.length);
  const leafTint=new T.Color();
  boughs.forEach((matrix,i)=>{
    paintedLeaves.setMatrixAt(i,matrix);
    const x=matrix.elements[12]!, z=matrix.elements[14]!;
    if(x<-.8 && x>-7 && z>-7.1 && z<-1.3)leafTint.setRGB(1.45,.72+.13*Math.sin(i),.41);
    else leafTint.setRGB(.93,1.0,.86);
    paintedLeaves.setColorAt(i,leafTint);
  });
  scene.add(paintedLeaves);
  const blades:number[]=[],shades:number[]=[];
  for(let i=0;i<1650;i++){
    const x=(random()-.5)*26,z=-1.45-random()*12.8;
    if(Math.abs(x-Math.sin((-z+1)*.34)*.84)<1.35 || (Math.abs(x)>4.4 && z<-6.1 && z>-10.5))continue;
    const tone=new T.Color().setHSL(.19+random()*.047,.16+random()*.14,.27+random()*.18);
    for(let j=0;j<5;j++){
      const px=x+(random()-.5)*.14,pz=z+(random()-.5)*.11,h=.08+random()*.24;
      blades.push(px-.016,-.015,pz,px+.017,-.015,pz+.004,px+(random()-.5)*.19,h,pz+.025);
      for(let k=0;k<3;k++)shades.push(tone.r,tone.g,tone.b);
    }
    if(i%31===0){const stonelet=piece(stone,x,.036,z,material('#8f927f'));stonelet.scale.set(.13,.055,.11);}
  }
  const reeds=new T.BufferGeometry();reeds.setAttribute('position',new T.Float32BufferAttribute(blades,3));
  reeds.setAttribute('color',new T.Float32BufferAttribute(shades,3));reeds.computeVertexNormals();
  scene.add(new T.Mesh(reeds,new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide})));
  return {door,desk,book,wind,disposables,nearBank,farBank,cottage};
}

export async function loadResidentModels() {
  const loader=new GLTFLoader();
  const [bird,gardener,binder]=await Promise.all(['egret.glb','folk/character-female-a.glb','folk/character-male-c.glb'].map(file=>loader.loadAsync('/town/'+file)));
  return {bird:bird!,gardener:gardener!,binder:binder!};
}
