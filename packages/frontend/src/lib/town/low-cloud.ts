import * as T from 'three';
import type { ValleyLighting } from './bay-world.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

const noise=new ImprovedNoise();

function randomStream(seed:number){
  return ()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };
}

function* densityField(seed:number,formation?:number){
  const distant=formation!==undefined;
  const random=randomStream(seed);
  const w=distant?56:96,h=distant?30:52,d=distant?28:44,voxels=new Uint8Array(w*h*d*4);
  const lobes:{x:number;y:number;z:number;rx:number;ry:number;rz:number}[]=[];
  const spine=6+Math.floor(random()*3),summit=random()*.84-.42;
  for(let i=0;i<spine;i++){
    const x=-.71+1.42*i/(spine-1);
    const fullness=1-Math.abs(x);
    lobes.push({x,y:-.56+random()*.12,z:(random()-.5)*.26+(formation===1?.21*Math.sin(i*1.24):0),
      rx:.22+random()*.13,ry:.20+fullness*.17+random()*.10,rz:.36+random()*.23});
  }
  const turrets=formation===0?1:2+Math.floor(random()*3);
  for(let i=0;i<turrets;i++){
    const x=i===0?summit:(random()-.5)*1.03;
    const height=formation===0?.32+random()*.10:i===0?.68+random()*.26:.32+random()*.35;
    const z=(random()-.5)*.31;
    lobes.push({x,y:-.25,z,rx:.26+random()*.13,ry:.41,rz:.46+random()*.14});
    lobes.push({x:x+(random()-.5)*.13,y:height-.63,z,rx:.17+random()*.14,ry:.37+random()*.14,rz:.28+random()*.20});
  }
  const offset=random()*128;
  const at=(x:number,y:number,z:number)=>4*(x+w*(y+h*z));
  for(let z=0;z<d;z++){
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=x/(w-1)*2-1,v=y/(h-1)*2-1,k=z/(d-1)*2-1;
      let distance=4;
      for(const l of lobes){
        const a=(u-l.x)/l.rx,b=(v-l.y)/l.ry,c=(k-l.z)/l.rz;
        distance=Math.min(distance,a*a+b*b+c*c);
      }
      if(distance>2)continue;
      const broad=noise.noise(u*7.2+offset,v*3.8,k*3.4);
      const detail=noise.noise(u*21,v*9+offset,k*9)*.14+noise.noise(u*43,v*19,k*19+offset)*.07;
      const edge=T.MathUtils.smoothstep(1-Math.max(Math.abs(u),Math.abs(v),Math.abs(k)),0,.075);
      const water=edge*T.MathUtils.smoothstep(1-Math.sqrt(distance)+broad*.32+detail,-.075,.36);
      const index=at(x,y,z);
      voxels[index]=Math.round(255*water);
      voxels[index+2]=Math.round(255*T.MathUtils.clamp(.51+.56*noise.noise(u*3.1-offset,v*2.3,k*2.7)+broad*.21,0,1));
    }
    yield;
  }
  const tex=new T.Data3DTexture(voxels,w,h,d);tex.format=T.RGBAFormat;
  tex.minFilter=tex.magFilter=T.LinearFilter;tex.unpackAlignment=1;tex.needsUpdate=true;
  return tex;
}

function complete(field:ReturnType<typeof densityField>){
  let slice=field.next();
  while(!slice.done)slice=field.next();
  return slice.value;
}

function cloudMaterial(volume:T.Data3DTexture,lighting:ValleyLighting){
  const clock={value:0},humidity={value:1};
  const mat=new T.ShaderMaterial({glslVersion:T.GLSL3,uniforms:{volume:{value:volume},clock,humidity,
    sunDirection:{value:lighting.direction},sunColor:{value:lighting.direct}},transparent:true,
    side:T.BackSide,depthWrite:false,vertexShader:`
      uniform vec3 sunDirection;
      out vec3 cell;flat out vec3 eye,lightStep;
      void main(){cell=position;mat4 local=inverse(modelMatrix);eye=(local*vec4(cameraPosition,1.)).xyz;
        lightStep=(local*vec4(sunDirection*8.,0.)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      precision highp sampler3D;
      uniform sampler3D volume;uniform float clock,humidity;uniform mat4 projectionMatrix,modelViewMatrix;
      uniform vec3 sunColor;
      in vec3 cell;flat in vec3 eye,lightStep;out vec4 outColor;
      void main(){
        vec3 ray=normalize(cell-eye),inv=1./(ray+vec3(.000001));
        vec3 a=(-.5-eye)*inv,b=(.5-eye)*inv;
        vec3 lo=min(a,b),hi=max(a,b);
        float start=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));
        float stepSize=(end-start)/44.;
        if(stepSize<=0.)discard;
        float jitter=fract(dot(floor(gl_FragCoord.xy),vec2(.75487767,.56984029)));
        float transmission=1.,front=-1.;
        vec3 light=vec3(0.);
        for(int i=0;i<44;i++){
          float t=start+(float(i)+jitter)*stepSize;
          vec3 p=eye+t*ray+.5;
          vec3 weather=texture(volume,p+vec3(.003*sin(clock*.11+p.y*7.),0.,.004*cos(clock*.09+p.x*11.))).rgb;
          float dewPoint=.13+.35*(1.-weather.r)+.34*weather.b;
          float condensed=smoothstep(dewPoint-.11,dewPoint+.20,humidity)*smoothstep(0.,.42,humidity);
          float opacity=1.-exp(-weather.r*condensed*stepSize*16.);
          if(front<0. && opacity>.0002)front=t;
          float sky=.5+.5*p.y;
          vec3 shade=vec3(.054,.086,.105)*sky;
          if(opacity<.00001)continue;
          float depth=texture(volume,p+lightStep*.5).r
            +texture(volume,p+lightStep*1.5).r+texture(volume,p+lightStep*3.).r;
          float sunlight=exp(-depth*condensed*1.35);
          vec3 sun=sunColor*.43*sunlight;
          light+=transmission*opacity*(shade+sun);
          transmission*=1.-opacity;
          if(transmission<.012)break;
        }
        if(front<0.||transmission>.998)discard;
        vec4 clip=projectionMatrix*modelViewMatrix*vec4(eye+ray*front,1.);
        gl_FragDepth=.5+.5*clip.z/clip.w;
        outColor=vec4(light/max(.001,1.-transmission),1.-transmission);
      }`});
  return mat;
}

type CloudBank={
  anchor:T.Vector3;size:T.Vector3;drift:T.Vector3;heading:number;rate:number;offset:number;
};

function cloudLayer(geometry:T.BoxGeometry,seed:number,bank:CloudBank,lighting:ValleyLighting){
  let generation=0;
  const seedFor=(index:number)=>(seed+Math.imul(index,0x9e3779b9))>>>0;
  let volume=complete(densityField(seed));
  const material=cloudMaterial(volume,lighting),mesh=new T.Mesh(geometry,material);
  mesh.renderOrder=3;
  const origin=new T.Vector3();
  function place(index:number){
    const random=randomStream(seedFor(index)^0x317d2cb1);
    origin.copy(bank.anchor);
    origin.x+=(random()-.5)*34;origin.z+=(random()-.5)*84;
    const height=.87+.25*random();
    mesh.scale.set(bank.size.x*(.84+.30*random()),bank.size.y*height,bank.size.z*(.88+.24*random()));
    origin.y+=(height-1)*bank.size.y*.38;
    mesh.rotation.y=bank.heading+(random()-.5)*.26;
  }
  place(0);
  let preparing:ReturnType<typeof densityField>|undefined,upcoming:T.Data3DTexture|undefined;
  let last=-1;
  function tick(t:number){
    if(t===last)return;
    last=t;
    const age=bank.offset+t*bank.rate/(2*Math.PI),index=Math.floor(age),phase=age-index;
    if(index!==generation){
      const next=index===generation+1 && upcoming?upcoming:complete(densityField(seedFor(index)));
      if(upcoming!==next)upcoming?.dispose();
      volume.dispose();volume=next;material.uniforms.volume!.value=volume;
      upcoming=undefined;preparing=undefined;generation=index;place(index);
    }
    if(phase>.47 && !upcoming){
      preparing??=densityField(seedFor(index+1));
      const slice=preparing.next();
      if(slice.done){upcoming=slice.value;preparing=undefined;}
    }
    const humidity=T.MathUtils.smootherstep(phase,.025,.40)*(1-T.MathUtils.smootherstep(phase,.47,.96));
    material.uniforms.clock!.value=t;material.uniforms.humidity!.value=humidity;
    mesh.position.copy(origin).addScaledVector(bank.drift,phase-.32);
    mesh.visible=humidity>.001;
  }
  tick(0);
  return {mesh,tick,dispose(){material.dispose();volume.dispose();upcoming?.dispose();preparing=undefined;}};
}

export function createLowCloud(lighting:ValleyLighting){
  const seeds=crypto.getRandomValues(new Uint32Array(2)),geometry=new T.BoxGeometry(1,1,1);
  const near=cloudLayer(geometry,seeds[0]!,{
    anchor:new T.Vector3(121,47,-192),size:new T.Vector3(259,104,94),drift:new T.Vector3(115,7,-146),heading:0,rate:.023,offset:.32
  },lighting);
  const far=cloudLayer(geometry,seeds[1]!,{
    anchor:new T.Vector3(35,78,1210),size:new T.Vector3(305,77,151),drift:new T.Vector3(86,9,-183),heading:2.48,rate:.013,offset:.66
  },lighting);
  const sky=new T.Group();sky.add(near.mesh,far.mesh);
  const fields=Array.from({length:3},(_,i)=>complete(densityField(seeds[0]!+i+1,i)));
  const radius=6,spacing=485,count=radius*2+1;
  const banks=Array.from({length:count},()=>{
    const material=cloudMaterial(fields[0]!,lighting),mesh=new T.Mesh(geometry,material);
    mesh.name='Valley cloud bank';mesh.renderOrder=3;sky.add(mesh);
    return {mesh,material,row:Infinity,origin:new T.Vector3(),drift:new T.Vector3(),offset:0,period:1};
  });
  function tick(t:number,eyeZ=0){
    near.tick(t);far.tick(t);
    const center=Math.round(eyeZ/spacing);
    for(let row=center-radius;row<=center+radius;row++){
      const bank=banks[T.MathUtils.euclideanModulo(row,count)]!;
      if(bank.row!==row){
        const random=randomStream(seeds[1]!^Math.imul(row+487,0x9e3779b9));
        bank.row=row;
        bank.origin.set(-64+random()*290,68+random()*76,row*spacing+(random()-.5)*132);
        bank.drift.set(61+random()*74,5+random()*10,-116-random()*116);
        bank.period=160+random()*115;bank.offset=random();
        bank.mesh.scale.set(158+random()*132,39+random()*49,77+random()*83);
        bank.mesh.rotation.y=(random()-.5)*1.84;
        bank.material.uniforms.volume!.value=fields[Math.floor(random()*fields.length)];
      }
      const phase=T.MathUtils.euclideanModulo(t/bank.period+bank.offset,1);
      bank.mesh.position.copy(bank.origin).addScaledVector(bank.drift,phase-.5);
      const distance=Math.abs(bank.mesh.position.z-eyeZ);
      const humidity=T.MathUtils.smoothstep(phase,0,.19)*(1-T.MathUtils.smoothstep(phase,.78,1))
        *(1-T.MathUtils.smoothstep(distance,spacing*(radius-1.5),spacing*(radius-.75)));
      bank.material.uniforms.clock!.value=t+bank.offset*200;
      bank.material.uniforms.humidity!.value=humidity;
      bank.mesh.visible=humidity>.002 && (row<0 || row>2);
    }
  }
  tick(0);
  return {cloud:sky,tick,dispose(){
    for(const bank of banks)bank.material.dispose();
    for(const field of fields)field.dispose();
    near.dispose();far.dispose();geometry.dispose();
  }};
}
