import {sunbreak} from './sunbreak.js';
import { valleyOrigin } from './valley-river.js';
import { ferryWake, wakeLifetime, wakeSamples } from './ferry-wake.js';
import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export function capillarySlopes() {
  const size=128, data=new Uint8Array(size*size*4);
  const modes=Array.from({length:22},(_,i)=>{
    const frequency=2+i*.68;
    const angle=.61*Math.sin(i*2.39996)+.25;
    return {x:Math.round(Math.sin(angle)*frequency),z:Math.round(Math.cos(angle)*frequency),
      phase:i*4.87,weight:1/Math.sqrt(frequency)};
  });
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    let dx=0,dz=0;
    for(const m of modes){
      const slope=m.weight*Math.cos((m.x*x+m.z*z)*2*Math.PI/size+m.phase)/Math.hypot(m.x,m.z);
      dx+=m.x*slope;dz+=m.z*slope;
    }
    const j=4*(z*size+x);
    data[j]=T.MathUtils.clamp(128+dx*42,0,255);data[j+1]=T.MathUtils.clamp(128+dz*42,0,255);
    data[j+3]=255;
  }
  const texture=new T.DataTexture(data,size,size);
  texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;
  texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

export function createBayWater(sunDirection:T.Vector3,sun:T.DirectionalLight,hdr:boolean,afterglow:boolean,daylight:T.IUniform<number>) {
  const geometry=new T.PlaneGeometry(12000,12000);
  const water=new Reflector(geometry,{textureWidth:960,textureHeight:640,multisample:0,clipBias:.003});
  if(!hdr)water.getRenderTarget().texture.type=T.UnsignedByteType;
  water.rotation.x=-Math.PI/2;water.position.y=.01;water.renderOrder=1;
  const material=water.material as T.ShaderMaterial,slopes=capillarySlopes();
  const bounds=new T.Vector2(),clock={value:0};
  const wakes=[ferryWake(),ferryWake()];
  const wakeCounts=new Int32Array(wakes.length);
  Object.assign(material.uniforms,{wakeTrail:{value:wakes.flatMap(w=>w.trail.value)},wakeCount:{value:wakeCounts},wakeBounds:{value:wakes.map(w=>w.bounds.value)}});
  Object.assign(material.uniforms,{daylight,slopes:{value:slopes},sunDirection:{value:sunDirection},bounds:{value:bounds},clock});
  material.uniforms.shadowFrame={value:sun.shadow.matrix};
  material.uniforms.shadowDepth={value:null};
  const reflect=water.onBeforeRender.bind(water);
  const reflectedEye=new T.Vector3(),reflectedRotation=new T.Quaternion(),reflectedProjection=new T.Matrix4();
  const worldToReflection=new T.Matrix4(),surfaceInverse=new T.Matrix4();
  const reflectionUv=material.uniforms.textureMatrix!.value as T.Matrix4;
  let reflectedAt=-Infinity;
  water.onBeforeRender=(...args)=>{
    const camera=args[2],elapsed=clock.value-reflectedAt;
    const travel=T.MathUtils.clamp((camera.position.y-water.position.y)*.025,.3,2.5);
    if(elapsed<0 || elapsed>=.14 || water.forceUpdate || !reflectedProjection.equals(camera.projectionMatrix)
      || reflectedEye.distanceToSquared(camera.position)>travel*travel
      || Math.abs(reflectedRotation.dot(camera.quaternion))<.9998){
      reflect(...args);
      reflectedAt=clock.value;reflectedEye.copy(camera.position);reflectedRotation.copy(camera.quaternion);
      reflectedProjection.copy(camera.projectionMatrix);
      worldToReflection.multiplyMatrices(reflectionUv,surfaceInverse.copy(water.matrixWorld).invert());
    }else{
      reflectionUv.multiplyMatrices(worldToReflection,water.matrixWorld);
    }
    material.uniforms.shadowDepth!.value=sun.shadow.map?.depthTexture;
  };
  material.vertexShader='varying vec3 surface;'+material.vertexShader.replace('vUv =','surface=(modelMatrix*vec4(position,1.)).xyz; vUv =');
  material.fragmentShader=`
    varying vec3 surface; varying vec4 vUv;
    uniform sampler2D tDiffuse,slopes;
    uniform vec3 sunDirection;
    uniform vec2 bounds;
    uniform mat4 shadowFrame;
    uniform highp sampler2DShadow shadowDepth;
    uniform float clock,daylight;
    uniform int wakeCount[${wakes.length}];
    uniform vec4 wakeTrail[${wakeSamples*wakes.length}],wakeBounds[${wakes.length}];
    ${afterglow?sunbreak:''}
    float cellValue(vec2 cell){
      vec3 h=fract(vec3(cell.xyx)*vec3(.1031,.1030,.0973));
      h+=dot(h,h.yzx+33.33);
      return fract((h.x+h.y)*h.z);
    }
    float flowNoise(vec2 p){
      vec2 cell=floor(p),f=fract(p);
      f=f*f*(3.-2.*f);
      return mix(mix(cellValue(cell),cellValue(cell+vec2(1.,0.)),f.x),
                 mix(cellValue(cell+vec2(0.,1.)),cellValue(cell+1.),f.x),f.y);
    }
    void main(){
      vec2 p=surface.xz;
      vec3 eye=cameraPosition-surface;
      float range=length(eye);eye/=range;
      float station=${valleyOrigin.z}.-p.y;
      float edge=8.+19.*sin(station*.012+.65)+8.*sin(station*.029)-2.4*cos(station*.056);
      float width=24.+5.*sin(station*.017)+4.*cos(station*.031);
      float shore=p.x-${valleyOrigin.x}.-edge;
      float side=step(width*.5,shore);
      float bar=.5+.5*sin(station*.077+side*3.1+.8*sin(station*.039));
      float scallop=.65*sin(station*.36+side*4.)+.32*sin(station*.83+side);
      float bankDistance=min(shore,width-shore)-scallop-bar*1.25;
      float channel=smoothstep(-.5,width*.44,bankDistance);
      float bend=.228*cos(station*.012+.65)+.232*cos(station*.029)+.1344*sin(station*.056);
      vec2 downstream=normalize(vec2(bend,-1.)),across=vec2(-downstream.y,downstream.x);
      vec2 reach=vec2(shore,station);
      float breeze=flowNoise(reach*vec2(.083,.039)-vec2(.014,.028)*clock);
      vec2 field=vec2(flowNoise(reach*vec2(.12,.061)+vec2(9.,-clock*.034)),
                      flowNoise(reach*vec2(.089,.074)+vec2(clock*.018,31.)))-.5;
      vec2 drift=reach+vec2(3.8,5.6)*field;
      vec2 slowUv=vec2(drift.x*.074+drift.y*.028,drift.y*.105)-vec2(.012,.038)*clock;
      vec2 fastUv=vec2(drift.x*.133-drift.y*.053,drift.y*.162+drift.x*.081)-vec2(-.017,.105)*clock;
      vec2 sheltered=texture2D(slopes,slowUv).rg-.5;
      vec2 current=texture2D(slopes,fastUv+field.yx*.62).rg-.5;
      float riffle=channel*smoothstep(.22,.77,breeze);
      vec2 fine=sheltered*vec2(.18,.23)+riffle*current*vec2(.35,.52);
      float swell=.060*(.32+riffle)*sin(drift.y*.51+drift.x*.23+6.*field.x-clock*.66);
      float footprint=max(length(dFdx(p)),length(dFdy(p)));
      vec2 detail=(across*fine.x+downstream*fine.y)*(1.-smoothstep(.4,2.7,footprint));
      vec2 slope=detail+(downstream*swell+across*field.x*.035)*(1.-smoothstep(2.,9.,footprint));
      float propWash=0.;
      for(int route=0;route<${wakes.length};route++){
        vec4 region=wakeBounds[route];
        if(wakeCount[route]<2 || any(lessThan(p,region.xy-7.)) || any(greaterThan(p,region.zw+7.)))continue;
        float closest=1e5;
        vec2 radial=vec2(0.);
        float age=0.,power=0.;
        for(int i=1;i<${wakeSamples};i++){
          if(i>=wakeCount[route])break;
          int index=route*${wakeSamples}+i;
          vec4 a=wakeTrail[index-1],b=wakeTrail[index];
          vec2 segment=b.xy-a.xy;
          float t=clamp(dot(p-a.xy,segment)/max(dot(segment,segment),.00001),0.,1.);
          vec4 samplePoint=mix(a,b,t);
          float seconds=max(0.,clock-samplePoint.z);
          vec2 delta=p-samplePoint.xy-downstream*.08*seconds;
          float d=length(delta);
          if(d<closest){
            closest=d;radial=delta/max(.01,d);age=seconds;power=samplePoint.w;
          }
        }
        float energy=power*(1.-smoothstep(1.,${wakeLifetime}.,age))*smoothstep(.9,3.1,bankDistance);
        float crest=closest-.38-.44*age+.12*field.x;
        float envelope=exp(-crest*crest/(.28+.12*age));
        slope+=radial*.43*cos(crest*6.)*envelope*energy*(1.-smoothstep(.18,1.,footprint));
        propWash+=energy*(.32*envelope+.6*exp(-closest*closest/(.28+.08*age)-age*.60))*(.54+.46*breeze);
      }
      vec3 n=normalize(vec3(slope.x,1.,slope.y));
      vec2 uv=vUv.xy/vUv.w;
      float fresnel=.024+.92*pow(1.-clamp(dot(eye,n),0.,1.),4.);
      vec3 reflectedBend=mat3(viewMatrix)*(reflect(-eye,n)-reflect(-eye,vec3(0.,1.,0.)));
      vec2 distortion=reflectedBend.xy*vec2(.13,.21)*min(1.,48./max(range,1.));
      distortion*=1.-smoothstep(160.,1100.,range);
      vec3 reflected=texture2D(tDiffuse,clamp(uv+distortion,.001,.999)).rgb;
      float coast=(1.-smoothstep(0.,14.,max(bounds.x-station,station-bounds.y)));
      float shallow=exp(-.16*max(0.,bankDistance))*(.68+.32*field.y);
      vec3 body=mix(vec3(.017,.080,.113),vec3(.062,.171,.146),shallow);
      float bed=1.-smoothstep(.12,3.3,bankDistance);
      body=mix(body,vec3(.116,.123,.084)*(.77+.38*breeze),bed);
      vec3 halfAngle=normalize(eye+sunDirection);
      float rough=.079+.045*riffle+.027*smoothstep(.25,1.9,footprint);
      float a2=rough*rough, nh=max(dot(n,halfAngle),0.);
      float denom=(1.-nh*nh)+a2*nh*nh;
      float glint=.0058*a2/max(.00001,denom*denom);
      vec3 sc=(shadowFrame*vec4(surface,1.)).xyz;
      float sunlight=1.;
      if(all(greaterThan(sc,vec3(0.)))&&all(lessThan(sc,vec3(1.))))
        sunlight=texture(shadowDepth,vec3(sc.xy,sc.z-.0004));
      body*=mix(vec3(.10,.13,.24),vec3(1.),daylight);
      vec3 color=mix(body*(.74+.26*sunlight),reflected,clamp(fresnel+.21,0.,1.))
        +sunlight*glint*mix(vec3(.10,.16,.33),vec3(2.1,1.21,.52),daylight);
      ${afterglow?`
      color+=daylight*sunbreakAt(surface,clock,sunDirection)*sunlight*glint*vec3(1.45,.97,.44);`:''}
      float foam=coast*exp(-1.9*abs(bankDistance-.5-field.x))*smoothstep(.52,.82,breeze);
      color=mix(color,vec3(.55,.67,.58)*mix(.12,1.,daylight),clamp(foam*.36+propWash,0.,.8));
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  return {water,bounds,clock,wakes,wakeCounts,resize(w:number,h:number){
    const scale=Math.min(.52,800/w,512/h);
    water.getRenderTarget().setSize(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));
    water.forceUpdate=true;
  },dispose(){water.dispose();geometry.dispose();slopes.dispose();}};
}
