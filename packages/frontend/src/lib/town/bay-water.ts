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
    void main(){
      vec2 p=surface.xz;
      vec3 eye=cameraPosition-surface;
      float range=length(eye);eye/=range;
      vec2 warped=p+2.8*sin(p.yx*.058+sin(p*.027))+1.7*cos(p*vec2(.078,.052));
      vec2 swell=vec2(.031,.051)*cos(dot(warped,vec2(.32,.60))-clock*.89)
                +vec2(-.039,.026)*cos(dot(warped,vec2(-.63,.42))-clock*1.18);
      vec2 cap=(texture2D(slopes,p*.114+clock*vec2(.009,-.021)).rg-.5)*.38;
      vec2 crossSea=(texture2D(slopes,vec2(p.y,-p.x)*.24+clock*vec2(-.023,.015)).gr-.5)*vec2(-.13,.13);
      vec2 slope=(swell+cap+crossSea)*(1.-.94*smoothstep(105.,480.,range));
      vec3 n=normalize(vec3(slope.x,1.,slope.y));
      vec3 varyNormal=mat3(viewMatrix)*vec3(n.x,0.,n.z);
      vec2 uv=vUv.xy/vUv.w;
      float fresnel=.024+.92*pow(1.-clamp(dot(eye,n),0.,1.),4.);
      vec2 distortion=varyNormal.xy*vec2(.096,.17)*min(1.,24./max(range,1.))+.032*n.z*vec2(0.,1.);
      distortion*=1.-smoothstep(160.,1100.,range);
      vec3 reflected=texture2D(tDiffuse,clamp(uv+distortion,.001,.999)).rgb;
      float station=${valleyOrigin.z}.-p.y;
      float edge=8.+19.*sin(station*.012+.65)+8.*sin(station*.029)-2.4*cos(station*.056);
      float shore=p.x-${valleyOrigin.x}.-edge;
      float coast=(1.-smoothstep(0.,14.,max(bounds.x-station,station-bounds.y)));
      float shallow=coast*exp(-.20*max(0.,shore))*smoothstep(-6.,-1.,shore);
      vec3 body=mix(vec3(.017,.080,.113),vec3(.071,.245,.214),shallow);
      vec3 halfAngle=normalize(eye+sunDirection);
      float rough=.095+.030*smoothstep(20.,140.,range);
      float a2=rough*rough, nh=max(dot(n,halfAngle),0.);
      float denom=(1.-nh*nh)+a2*nh*nh;
      float glint=.010*a2/max(.00001,denom*denom);
      vec3 sc=(shadowFrame*vec4(surface,1.)).xyz;
      float sunlight=1.;
      if(all(greaterThan(sc,vec3(0.)))&&all(lessThan(sc,vec3(1.))))
        sunlight=texture(shadowDepth,vec3(sc.xy,sc.z-.0004));
      vec3 color=mix(body*(.74+.26*sunlight),reflected,clamp(fresnel+.21,0.,1.))
        +sunlight*glint*vec3(2.1,1.21,.52);
      ${afterglow?`
      float facets=dot(cap+crossSea+swell*.3,vec2(.72,-.69));
      float spark=sunbreakAt(surface,clock,sunDirection)*sunlight*smoothstep(.025,.085,facets);
      color+=vec3(1.45,.97,.44)*spark;`:''}
      float foam=coast*exp(-.98*abs(shore-1.1-.45*sin(clock*.73+p.x*.71)-cap.y*4.));
      color=mix(color,vec3(.55,.67,.58),foam*smoothstep(.01,.12,cap.y)*.60);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  return {water,bounds,clock,dispose(){water.dispose();geometry.dispose();slopes.dispose();}};
}
