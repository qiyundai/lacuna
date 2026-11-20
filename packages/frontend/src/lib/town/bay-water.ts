import {sunbreak} from './sunbreak.js';
import { valleyOrigin } from './valley-river.js';
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

export function createBayWater(sunDirection:T.Vector3,sun:T.DirectionalLight,hdr:boolean,afterglow=false) {
  const geometry=new T.PlaneGeometry(12000,12000);
  const water=new Reflector(geometry,{textureWidth:960,textureHeight:640,multisample:0,clipBias:.003});
  if(!hdr)water.getRenderTarget().texture.type=T.UnsignedByteType;
  water.rotation.x=-Math.PI/2;water.position.y=.01;water.renderOrder=1;
  const material=water.material as T.ShaderMaterial,slopes=capillarySlopes();
  const bounds=new T.Vector2(),clock={value:0};
  Object.assign(material.uniforms,{slopes:{value:slopes},sunDirection:{value:sunDirection},bounds:{value:bounds},clock});
  material.uniforms.shadowFrame={value:sun.shadow.matrix};
  material.uniforms.shadowDepth={value:null};
  const reflect=water.onBeforeRender.bind(water);
  water.onBeforeRender=(...args)=>{
    reflect(...args);
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
    uniform float clock;
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
      float bankDistance=min(shore,width-shore);
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
      vec3 halfAngle=normalize(eye+sunDirection);
      float rough=.079+.045*riffle+.027*smoothstep(.25,1.9,footprint);
      float a2=rough*rough, nh=max(dot(n,halfAngle),0.);
      float denom=(1.-nh*nh)+a2*nh*nh;
      float glint=.0058*a2/max(.00001,denom*denom);
      vec3 sc=(shadowFrame*vec4(surface,1.)).xyz;
      float sunlight=1.;
      if(all(greaterThan(sc,vec3(0.)))&&all(lessThan(sc,vec3(1.))))
        sunlight=texture(shadowDepth,vec3(sc.xy,sc.z-.0004));
      vec3 color=mix(body*(.74+.26*sunlight),reflected,clamp(fresnel+.21,0.,1.))
        +sunlight*glint*vec3(2.1,1.21,.52);
      ${afterglow?`
      color+=sunbreakAt(surface,clock,sunDirection)*sunlight*glint*vec3(1.45,.97,.44);`:''}
      float foam=coast*exp(-1.9*abs(bankDistance-.5-field.x))*smoothstep(.52,.82,breeze);
      color=mix(color,vec3(.55,.67,.58),foam*.36);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  return {water,bounds,clock,dispose(){water.dispose();geometry.dispose();slopes.dispose();}};
}
