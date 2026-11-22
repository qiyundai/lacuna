import * as T from 'three';
import type { ValleyLighting } from './bay-world.js';
import { cloudDriftRate, corridorLightField } from './corridor-light.js';
import { sunbreak } from './sunbreak.js';

function randomStream(seed:number){
  return ()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };
}

const puffCount=6;

function moistureTexture(seed:number){
  const random=randomStream(seed),side=48,voxels=new Float32Array(side**3*4);
  for(const [cells,weight] of [[4,.58],[8,.29],[16,.13]] as const){
    const lattice=Float32Array.from({length:cells**3*4},random);
    for(let z=0;z<side;z++)for(let y=0;y<side;y++)for(let x=0;x<side;x++){
      const u=x*cells/side,v=y*cells/side,w=z*cells/side;
      const i=Math.floor(u),j=Math.floor(v),k=Math.floor(w);
      const fx=T.MathUtils.smootherstep(u-i,0,1),fy=T.MathUtils.smootherstep(v-j,0,1),fz=T.MathUtils.smootherstep(w-k,0,1);
      const dest=4*(x+side*(y+side*z));
      for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
        const src=4*((i+dx)%cells+cells*((j+dy)%cells+cells*((k+dz)%cells)));
        const blend=(dx?fx:1-fx)*(dy?fy:1-fy)*(dz?fz:1-fz)*weight*255;
        for(let c=0;c<4;c++)voxels[dest+c]!+=lattice[src+c]!*blend;
      }
    }
  }
  const tex=new T.Data3DTexture(Uint8Array.from(voxels,Math.round),side,side,side);
  tex.wrapS=tex.wrapT=tex.wrapR=T.RepeatWrapping;
  tex.minFilter=tex.magFilter=T.LinearFilter;tex.unpackAlignment=1;tex.needsUpdate=true;
  return tex;
}

function cloudMaterial(volume:T.Data3DTexture,lighting:ValleyLighting,depth:T.IUniform<T.DepthTexture|null>,screen:T.Vector2,afterglow:boolean){
  return new T.ShaderMaterial({glslVersion:T.GLSL3,uniforms:{
    volume:{value:volume},clock:{value:0},cloudTime:{value:0},humidity:{value:0},puffs:{value:Array.from({length:puffCount},()=>new T.Vector4())},
    supply:{value:new Float32Array(puffCount)},weatherPhase:{value:new T.Vector3()},
    wispBase:{value:new T.Vector4()},wispTip:{value:new T.Vector4()},
    geometryDepth:depth,screen:{value:screen},sunDirection:{value:lighting.direction},sunColor:{value:lighting.direct},skyColor:{value:lighting.sky}
  },transparent:true,side:T.BackSide,depthTest:false,depthWrite:false,vertexShader:`
    out vec3 cell;flat out vec3 eye;
    void main(){
      mat4 local=inverse(modelMatrix);
      eye=(local*vec4(cameraPosition,1.)).xyz;
      cell=position;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    }`,
  fragmentShader:`
    precision highp sampler3D;
    uniform sampler3D volume;
    uniform sampler2D geometryDepth;
    uniform vec2 screen;
    uniform float clock,cloudTime,humidity;
    uniform vec4 puffs[${puffCount}];
    uniform vec4 wispBase,wispTip;
    uniform float supply[${puffCount}];
    uniform vec3 weatherPhase;
    uniform vec3 sunColor,sunDirection,skyColor;
    uniform mat4 projectionMatrix,modelViewMatrix,modelMatrix;
    in vec3 cell;flat in vec3 eye;out vec4 outColor;
    ${corridorLightField}
    ${afterglow?sunbreak:''}
    float cloudDensity(vec3 p){
      float moisture=0.;
      for(int j=0;j<${puffCount};j++){
        vec3 q=(p-puffs[j].xyz)*puffs[j].w;
        float support=max(0.,1.-.64*dot(q,q));
        moisture+=support*support*supply[j];
      }
      float density=0.;
      if(moisture>.028){
        vec3 parcel=(p-puffs[1].xyz)*.009+vec3(wispTip.w*.21,.16,-.37);
        vec4 pockets=texture(volume,parcel)-.5;
        vec3 detail=vec3(.8*parcel.z+.6*parcel.x,parcel.y,.8*parcel.x-.6*parcel.z);
        vec4 grain=texture(volume,detail*2.73+vec3(.31,-.12,.67))-.5;
        float saturation=1.-exp(-1.26*moisture);
        float dewPoint=.48+1.02*pockets.r+dot(pockets.gba,weatherPhase)*1.12
          +.59*grain.b+.44*dot(grain.arg,weatherPhase.yzx);
        density=smoothstep(-.08,.31,saturation-dewPoint)*smoothstep(.028,.20,moisture);
      }
      if(p.y>wispBase.y && p.y<wispTip.y){
        float rise=(p.y-wispBase.y)/(wispTip.y-wispBase.y);
        float taper=1.-rise;
        vec2 spine=mix(wispBase.xz,wispTip.xz,rise);
        float curl=sin(rise*9.-cloudTime*.42+wispTip.w);
        spine.y+=curl*wispBase.w*.28*sin(3.14159*rise);
        vec2 crossSection=(p.xz-spine)/(wispBase.w*(.12+.88*taper));
        float edge=dot(crossSection*vec2(1.2,.78),crossSection*vec2(1.2,.78));
        if(edge<1.){
          vec3 updraft=vec3(crossSection*.26,(p.y-wispBase.y)*.026-cloudTime*.057);
          vec4 vapor=texture(volume,updraft+wispTip.w)-.5;
          float veil=smoothstep(-.22,.20,vapor.r+dot(vapor.gba,weatherPhase)*.64-.17*rise);
          density+=(1.-density)*.43*taper*sqrt(taper)*(1.-smoothstep(.05,1.,edge))*(.16+.84*veil);
        }
      }
      return density;
    }
    void main(){
      vec3 ray=normalize(cell-eye),inv=1./(ray+vec3(.000001));
      vec3 a=(-.5-eye)*inv,b=(.5-eye)*inv,lo=min(a,b),hi=max(a,b);
      float start=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));
      float depth=texture(geometryDepth,gl_FragCoord.xy/screen).r;
      float viewDepth=projectionMatrix[3][2]/(depth*2.-1.+projectionMatrix[2][2]);
      vec3 viewRay=mat3(modelViewMatrix)*ray,worldRay=mat3(modelMatrix)*ray;
      end=min(end,viewDepth/max(.0001,-viewRay.z));
      if(end<=start)discard;
      const int steps=36;
      float dt=(end-start)/float(steps),ds=dt*length(worldRay);
      float jitter=fract(dot(floor(gl_FragCoord.xy),vec2(.75487767,.56984029)));
      float t=start+jitter*dt,transmission=1.;
      vec3 scatter=vec3(0.);
      for(int i=0;i<steps;i++,t+=dt){
        vec3 p=mat3(modelMatrix)*(eye+t*ray);
        float vapor=cloudDensity(p);
        if(vapor<.008)continue;
        float opacity=1.-exp(-ds*.078*vapor*humidity);
        vec3 world=cameraPosition+worldRay*t;
        float opening=smoothstep(-.38,.38,canopyLightField(world,clock));
        float shelter=cloudDensity(p+sunDirection*4.5)+.90*cloudDensity(p+sunDirection*12.)+.60*cloudDensity(p+sunDirection*27.);
        float sun=exp(-1.70*shelter*humidity);
        float shaft=${afterglow?'sunbreakAt(world,clock,sunDirection)':'0.'};
        vec3 sky=mix(vec3(.038,.053,.067),vec3(.15,.18,.19),clamp(.5+eye.y+t*ray.y,0.,1.));
        vec3 light=sky*min(vec3(1.),skyColor/vec3(.50,.59,.77))*(.72+.34*opening)+sunColor*sun*(.07+.63*opening+shaft*(.45+1.12*(1.-vapor)));
        scatter+=transmission*opacity*light;
        transmission*=1.-opacity;
        if(transmission<.018)break;
      }
      float alpha=1.-transmission;
      if(alpha<.002)discard;
      outColor=vec4(scatter/alpha,alpha);
    }`});
}

type Surface=(x:number,z:number)=>number;
type Wall=(side:number,z:number,y:number)=>number;
const spacing=360,radius=7;

export function createLowCloud(lighting:ValleyLighting,ground:Surface,wall:Wall,afterglow:boolean,
  seed=crypto.getRandomValues(new Uint32Array(1))[0]!){
  const cloud=new T.Scene(),geometry=new T.BoxGeometry(1,1,1);
  const volume=moistureTexture(seed);
  const box=new T.Box3(),corner=new T.Vector3();
  const depth={value:null as T.DepthTexture|null},screen=new T.Vector2(1,1);
  const banks=Array.from({length:2*radius+1},()=>{
    const material=cloudMaterial(volume,lighting,depth,screen,afterglow),mesh=new T.Mesh(geometry,material);
    mesh.name='Valley cloud bank';cloud.add(mesh);
    return {mesh,material,row:Infinity,generation:Infinity,period:0,offset:0,side:1,
      x:0,z:0,along:0,curve:0,contact:0,weatherOffset:0,
      lobes:Array.from({length:puffCount},()=>({x:0,y:0,z:0,r:0,delay:0,angle:0,rate:0}))};
  });

  function tick(t:number,eyeZ=0){
    const cloudTime=t*cloudDriftRate;
    const center=Math.round(eyeZ/spacing);
    for(let row=center-radius;row<=center+radius;row++){
      const bank=banks[T.MathUtils.euclideanModulo(row,banks.length)]!;
      const rowSeed=seed^Math.imul(row+487,0x9e3779b9);
      if(bank.row!==row){
        const random=randomStream(rowSeed);
        bank.row=row;bank.generation=Infinity;
        bank.period=64+random()*32;bank.offset=random();
      }
      const age=cloudTime/bank.period+bank.offset,index=Math.floor(age),phase=age-index;
      const {mesh,material}=bank;
      if(bank.generation!==index){
        const random=randomStream(rowSeed^Math.imul(index+1,0x85ebca6b));
        bank.generation=index;
        bank.z=(row+(random()-.5)*.65)*spacing;
        const west=wall(-1,bank.z,0),east=wall(1,bank.z,0);
        for(let i=0;i<8;i++){
          bank.x=T.MathUtils.lerp(west,east,.17+.66*random());
          if(ground(bank.x,bank.z)>0)break;
        }
        if(ground(bank.x,bank.z)<=0)bank.x=T.MathUtils.lerp(west,east,.12);
        bank.side=random()<.5?-1:1;
        const size=28+random()*10;
        bank.along=(random()-.5)*175;bank.curve=(random()-.5)*41;
        bank.contact=.64+.10*random();
        bank.weatherOffset=random()*40;
        const summit=(random()-.5)*1.4;
        for(const [j,puff] of bank.lobes.entries()){
          const base=j<3;
          puff.x=size*((base?(j-1)*1.14:j===5?summit:(j-3.5)*1.30)+.32*(random()-.5));
          puff.y=size*((base?.60:j===5?1.63:1.11)+(base?.18:.56)*random());
          puff.z=size*((j===1?-.52:j===3?.49:0)+.64*(random()-.5));
          puff.r=size*(.88+.26*random());
          puff.delay=base?.018*j:.04+.012*(j-3);
          puff.angle=random()*Math.PI*2;puff.rate=.24+.18*random();
        }
      }
      const travel=phase/bank.contact;
      const z=bank.z+bank.along*phase+bank.curve*Math.sin(Math.PI*phase);
      const edge=wall(bank.side,z,45);
      const crossed=(edge-bank.x)*travel;
      const centers=material.uniforms.puffs!.value as T.Vector4[];
      const supply=material.uniforms.supply!.value as Float32Array;
      const seconds=phase*bank.period+bank.weatherOffset;
      material.uniforms.weatherPhase!.value.set(Math.sin(seconds*.38),Math.sin(seconds*.26+1.7),Math.cos(seconds*.33-.9));
      box.makeEmpty();
      let pressure=0;
      for(const [j,puff] of bank.lobes.entries()){
        const growth=T.MathUtils.smoothstep(phase,puff.delay,puff.delay+.18);
        const radius=puff.r*(.04+.96*growth);
        const freeX=bank.x+crossed+puff.x*growth;
        const approachZ=z+puff.z*growth;
        const stop=wall(bank.side,approachZ,puff.y)-bank.side*radius*.72;
        const excess=Math.max(0,bank.side*(freeX-stop));
        pressure=Math.max(pressure,excess);
        const contact=T.MathUtils.smoothstep(excess,0,radius*1.25);
        const puffZ=approachZ+contact*(puff.x*.78+puff.z*.42)+Math.sign(bank.along)*excess*.23;
        const x=Math.min(bank.side*freeX,bank.side*wall(bank.side,puffZ,puff.y)-radius*.72)*bank.side;
        const settled=radius*(.55+.05*j);
        const y=Math.max(0,ground(x,puffZ))+T.MathUtils.lerp(growth*puff.y,settled,contact);
        centers[j]!.set(x,y,puffZ,1/radius);
        const cycle=seconds*puff.rate+puff.angle;
        const renewal=.65*Math.sin(cycle)+.35*Math.sin(cycle*.57+puff.angle);
        supply[j]=(j<3?1.20:.91)+(j<3?.29:.81)*renewal;
        box.expandByPoint(corner.set(x-1.25*radius,y-1.25*radius,puffZ-1.25*radius));
        box.expandByPoint(corner.set(x+1.25*radius,y+1.25*radius,puffZ+1.25*radius));
      }
      const base=material.uniforms.wispBase!.value as T.Vector4;
      const tip=material.uniforms.wispTip!.value as T.Vector4;
      const baseRadius=bank.lobes[0]!.r;
      const squeeze=T.MathUtils.smoothstep(pressure,0,baseRadius*1.4);
      const along=Math.sign(bank.along);
      const footZ=z+along*pressure*.23;
      const width=baseRadius*.5*squeeze;
      const footX=wall(bank.side,footZ,baseRadius)-bank.side*(width*.50+1);
      const footY=Math.max(0,ground(footX,footZ))+baseRadius*.46;
      const height=Math.min(pressure*1.45,baseRadius*4.8);
      const tipZ=footZ+along*height*.14;
      base.set(footX,footY,footZ,width);
      tip.set(wall(bank.side,tipZ,footY+height)-bank.side*1.6,footY+height,tipZ,bank.lobes[0]!.angle);
      if(width>0){
        for(const end of [base,tip]){
          box.expandByPoint(corner.set(end.x-width,end.y,end.z-width*1.6));
          box.expandByPoint(corner.set(end.x+width,end.y,end.z+width*1.6));
        }
      }
      box.getCenter(mesh.position);box.getSize(mesh.scale);
      base.x-=mesh.position.x;base.y-=mesh.position.y;base.z-=mesh.position.z;
      tip.x-=mesh.position.x;tip.y-=mesh.position.y;tip.z-=mesh.position.z;
      for(const p of centers){p.x-=mesh.position.x;p.y-=mesh.position.y;p.z-=mesh.position.z;}
      const distance=Math.abs(z-eyeZ);
      const humidity=T.MathUtils.smoothstep(phase,0,.16)*(1.-T.MathUtils.smoothstep(phase,bank.contact+.10,.985))
        *(1.-T.MathUtils.smoothstep(distance,spacing*(radius-1.4),spacing*(radius-.7)));
      material.uniforms.humidity!.value=humidity;
      material.uniforms.clock!.value=t;
      material.uniforms.cloudTime!.value=cloudTime;
      mesh.visible=humidity>.01;
    }
  }
  tick(0);
  return {cloud,tick,depth,screen,dispose(){
    for(const bank of banks)bank.material.dispose();
    volume.dispose();
    geometry.dispose();
  }};
}
