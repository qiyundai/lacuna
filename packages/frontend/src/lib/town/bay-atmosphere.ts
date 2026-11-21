import * as T from 'three';
import {sunbreak} from './sunbreak.js';
import {createSunlitPollen} from './sunlit-pollen.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { worldGradeMaterial } from './world-grade.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const screenVertex=`
  varying vec2 screenUv;
  void main(){screenUv=uv;gl_Position=vec4(position.xy,0.,1.);}
`;

export function createBayAtmosphere(renderer:T.WebGLRenderer,scene:T.Scene,camera:T.PerspectiveCamera,
  sun:T.DirectionalLight,direction:T.Vector3,afterglow=false){
  const hdr=renderer.extensions.has('EXT_color_buffer_float');
  const targetType=hdr?T.HalfFloatType:T.UnsignedByteType;
  const beauty=new T.WebGLRenderTarget(1,1,{type:targetType,samples:Math.min(2,renderer.capabilities.maxSamples)});
  beauty.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);
  const air=new T.WebGLRenderTarget(1,1,{type:targetType,depthBuffer:false});
  const sunUv=new T.Vector3(), eye=new T.Vector3();
  const pollen=afterglow?createSunlitPollen(direction,sun.shadow.matrix):null;
  if(pollen)scene.add(pollen.points);
  const uniforms={
    geometryDepth:{value:beauty.depthTexture},shadowDepth:{value:null as T.DepthTexture|null},
    invProjection:{value:camera.projectionMatrixInverse},eyeFrame:{value:camera.matrixWorld},
    shadowFrame:{value:sun.shadow.matrix},sunDir:{value:direction},eye:{value:eye},seconds:{value:0}
  };
  const haze=new T.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,vertexShader:screenVertex,fragmentShader:`
    varying vec2 screenUv;
    uniform sampler2D geometryDepth;
    uniform highp sampler2DShadow shadowDepth;
    uniform mat4 invProjection,eyeFrame,shadowFrame;
    uniform vec3 sunDir,eye;
    uniform float seconds;
    ${afterglow?sunbreak:''}
    void main(){
      float z=texture2D(geometryDepth,screenUv).r;
      vec4 endpoint=invProjection*vec4(screenUv*2.-1.,z*2.-1.,1.);
      vec3 sight=mat3(eyeFrame)*(endpoint.xyz/endpoint.w);
      float reach=min(length(sight),195.);
      vec3 ray=normalize(sight);
      float light=0.;
      const int steps=${afterglow?32:18};
      float stepSize=reach/float(steps);
      float jitter=fract(dot(floor(gl_FragCoord.xy),vec2(.75487767,.56984029)));
      for(int i=0;i<steps;i++){
        float d=(float(i)+jitter)*stepSize;
        vec3 p=eye+ray*d;
        vec3 sc=(shadowFrame*vec4(p,1.)).xyz;
        float visibility=1.;
        if(all(greaterThan(sc,vec3(0.)))&&all(lessThan(sc,vec3(1.))))
          visibility=texture(shadowDepth,vec3(sc.xy,sc.z-.0004));
        ${afterglow?`
        float layer=exp(-max(0.,p.y)*.025);
        light+=sunbreakAt(p,seconds,sunDir)*visibility*layer*exp(-d*.004)*stepSize;`:`
        float layer=exp(-max(0.,p.y)*.070);
        float gap=.55+.45*sin(dot(p.xz,vec2(.075,.041))-p.y*.39+seconds*.14);
        light+=visibility*layer*gap*exp(-d*.009)*stepSize;`}
      }
      float phase=.34+2.45*pow(max(dot(ray,sunDir),0.),9.);
      gl_FragColor=vec4(${afterglow?'vec3(1.,.83,.53)*light*.012*(.64+.48*phase)':'vec3(1.,.72,.45)*light*.00130*phase'},1.);
    }`});
  const shafts=new FullScreenQuad(haze);
  const combine=new ShaderPass(new T.ShaderMaterial({
    uniforms:{beauty:{value:beauty.texture},air:{value:air.texture},geometryDepth:{value:beauty.depthTexture},
      sunUv:{value:sunUv},aspect:{value:1},seconds:uniforms.seconds,sunDir:uniforms.sunDir,invProjection:uniforms.invProjection,
      eyeFrame:uniforms.eyeFrame,shadowFrame:uniforms.shadowFrame,shadowDepth:uniforms.shadowDepth},depthTest:false,depthWrite:false,vertexShader:screenVertex,fragmentShader:`
      varying vec2 screenUv;
      uniform sampler2D beauty,air,geometryDepth;
      uniform vec3 sunUv;
      uniform float aspect;
      ${afterglow?`
      uniform mat4 invProjection,eyeFrame,shadowFrame;
      uniform highp sampler2DShadow shadowDepth;
      uniform float seconds;
      uniform vec3 sunDir;
      ${sunbreak}
      vec3 valleyLight(vec3 color,float depth){
        vec4 local=invProjection*vec4(screenUv*2.-1.,depth*2.-1.,1.);
        vec3 viewPoint=local.xyz/local.w;
        vec3 p=(eyeFrame*vec4(viewPoint,1.)).xyz;
        float pool=sunbreakAt(p,seconds,sunDir);
        vec3 sc=(shadowFrame*vec4(p,1.)).xyz;
        float shade=1.;
        if(all(greaterThan(sc,vec3(0.)))&&all(lessThan(sc,vec3(1.)))) shade=texture(shadowDepth,vec3(sc.xy,sc.z-.0004));
        pool*=shade*(1.-smoothstep(45.,100.,p.y));
        return color*(1.+pool*vec3(.24,.17,.07));
      }`:''}
      void main(){
        vec3 lit=texture2D(beauty,screenUv).rgb;
        ${afterglow?'lit=valleyLight(lit,texture2D(geometryDepth,screenUv).r);':''}
        lit+=texture2D(air,screenUv).rgb;
        vec2 aspectScale=vec2(aspect,1.);
        float visibility=0.;
        if(sunUv.z>0. && all(greaterThan(sunUv.xy,vec2(0.))) && all(lessThan(sunUv.xy,vec2(1.)))){
          for(int i=0;i<7;i++){
            float angle=2.4*float(i);
            vec2 spot=sunUv.xy+vec2(cos(angle),sin(angle))*sqrt(float(i))*.002/aspectScale;
            float depth=texture2D(geometryDepth,spot).r;
            float lum=dot(texture2D(beauty,spot).rgb,vec3(.2126,.7152,.0722));
            visibility+=step(.99999,depth)*smoothstep(1.05,3.3,lum)/7.;
          }
        }
        vec2 axis=sunUv.xy-.5,screen=screenUv-.5;
        float source=length((screen-axis)*aspectScale);
        float amber=length((screen+axis*.49)*aspectScale);
        float teal=length((screen+axis*.78)*aspectScale);
        vec3 flare=vec3(1.,.52,.22)*(.20*exp(-source*15.)+.033*(1.-smoothstep(.038,.054,amber)));
        flare+=vec3(.38,.84,.77)*(.028*exp(-pow(abs(teal-.074)/.014,2.))+.018*exp(-teal*17.));
        gl_FragColor=vec4(lit+flare*visibility,1.);
      }`}));
  const composer=new EffectComposer(renderer,hdr?undefined:new T.WebGLRenderTarget(1,1,{type:targetType}));
  const bloom=new UnrealBloomPass(new T.Vector2(1,1),afterglow ? .36 : .23,.48,afterglow ? 1.24 : 1.12),output=new ShaderPass(worldGradeMaterial());
  composer.addPass(combine);if(hdr)composer.addPass(bloom);composer.addPass(output);
  return {
    resize(w:number,h:number){
      const dpr=renderer.getPixelRatio();
      if(pollen)pollen.uniforms.pixelRatio.value=dpr;
      beauty.setSize(Math.round(w*dpr),Math.round(h*dpr));
      air.setSize(Math.max(1,Math.round(w*dpr*.42)),Math.max(1,Math.round(h*dpr*.42)));
      combine.uniforms.aspect!.value=w/h;
      composer.setSize(w,h);
    },
    render(seconds:number){
      uniforms.seconds.value=seconds;
      if(pollen){
        pollen.uniforms.seconds.value=seconds;
        pollen.uniforms.shadowDepth.value=sun.shadow.map?.depthTexture??null;
        pollen.points.visible=Boolean(pollen.uniforms.shadowDepth.value);
      }
      renderer.setRenderTarget(beauty);renderer.render(scene,camera);
      eye.setFromMatrixPosition(camera.matrixWorld);
      sunUv.copy(eye).addScaledVector(direction,1000).project(camera);
      const facing=sunUv.z<1;
      sunUv.set(sunUv.x*.5+.5,sunUv.y*.5+.5,Number(facing));
      uniforms.shadowDepth.value=sun.shadow.map?.depthTexture??null;
      renderer.setRenderTarget(air);shafts.render(renderer);
      renderer.setRenderTarget(null);composer.render();
    },
    dispose(){
      if(pollen){scene.remove(pollen.points);pollen.dispose();}
      beauty.dispose();air.dispose();shafts.dispose();haze.dispose();combine.dispose();bloom.dispose();output.dispose();composer.dispose();
    }
  };
}
