import * as T from 'three';
import { sunbreak } from './sunbreak.js';

export function createSunlitPollen(direction:T.Vector3,shadowFrame:T.Matrix4){
  const geometry=new T.BufferGeometry();
  const seeds=new Float32Array(1800*3);
  let state=20471;
  for(let i=0;i<seeds.length;i++){
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    seeds[i]=state/4294967296;
  }
  geometry.setAttribute('position',new T.BufferAttribute(seeds,3));
  const uniforms={seconds:{value:0},pixelRatio:{value:1},sunDir:{value:direction},shadowFrame:{value:shadowFrame},
    shadowDepth:{value:null as T.DepthTexture|null}};
  const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`
      uniform float seconds,pixelRatio;
      uniform vec3 sunDir;
      uniform mat4 shadowFrame;
      uniform highp sampler2DShadow shadowDepth;
      varying float glimmer;
      ${sunbreak}
      void main(){
        float phase=position.z*87.+seconds*.26;
        vec2 drift=vec2(seconds*.16+sin(phase)*.7,seconds*.07+cos(phase*.7)*.4);
        vec2 offset=mod(position.xz*180.+drift-cameraPosition.xz+90.,180.)-90.;
        vec3 p=vec3(cameraPosition.x+offset.x,2.+position.y*position.y*48.+.6*sin(phase),cameraPosition.z+offset.y);
        vec4 view=viewMatrix*vec4(p,1.);
        gl_Position=projectionMatrix*view;
        gl_PointSize=pixelRatio*clamp(86./max(1.,-view.z),1.,3.4);
        vec3 sc=(shadowFrame*vec4(p,1.)).xyz;
        float visible=1.;
        if(all(greaterThan(sc,vec3(0.)))&&all(lessThan(sc,vec3(1.))))visible=texture(shadowDepth,vec3(sc.xy,sc.z-.0004));
        glimmer=visible*sunbreakAt(p,seconds,sunDir)*(1.-smoothstep(52.,88.,length(offset)))*(.60+.40*sin(phase)*sin(phase));
      }`,
    fragmentShader:`
      varying float glimmer;
      void main(){
        float r=length(gl_PointCoord-.5)*2.;
        gl_FragColor=vec4(2.2,1.67,.85,glimmer*(1.-smoothstep(.12,1.,r)));
      }`});
  const points=new T.Points(geometry,material);
  points.frustumCulled=false;
  return {points,uniforms,dispose(){geometry.dispose();material.dispose();}};
}
