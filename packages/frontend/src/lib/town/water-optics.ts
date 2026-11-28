import * as T from 'three';
import { Reflector, type ReflectorOptions } from 'three/addons/objects/Reflector.js';

const reflectionCameras=new WeakSet<T.Camera>();

export function waterReflection(geometry:T.BufferGeometry,clock:T.IUniform<number>,hdr:boolean,
  options:ReflectorOptions,range=Infinity,interval=.14){
  const surface=new Reflector(geometry,options);
  surface.rotation.x=-Math.PI/2;
  if(!hdr)surface.getRenderTarget().texture.type=T.UnsignedByteType;
  const material=surface.material as T.ShaderMaterial;
  const reflectionEnabled={value:0};
  material.uniforms.reflectionEnabled=reflectionEnabled;
  const reflect=surface.onBeforeRender.bind(surface);
  const mirrorPoint=new T.Vector3(),eye=new T.Vector3();
  const reflectedEye=new T.Vector3(),reflectedRotation=new T.Quaternion(),reflectedProjection=new T.Matrix4();
  const worldToReflection=new T.Matrix4(),inverse=new T.Matrix4();
  const uvMatrix=material.uniforms.textureMatrix!.value as T.Matrix4;
  let reflectedAt=-Infinity;
  surface.onBeforeRender=(...args)=>{
    const camera=args[2];
    mirrorPoint.setFromMatrixPosition(surface.matrixWorld);
    eye.setFromMatrixPosition(camera.matrixWorld);
    if(reflectionCameras.has(camera)||eye.distanceToSquared(mirrorPoint)>range*range||eye.y<=mirrorPoint.y){
      reflectionEnabled.value=0;
      return;
    }
    const elapsed=clock.value-reflectedAt;
    const travel=T.MathUtils.clamp((eye.y-mirrorPoint.y)*.025,.25,2.5);
    if(elapsed<0 || elapsed>=interval || surface.forceUpdate || !reflectedProjection.equals(camera.projectionMatrix)
      || reflectedEye.distanceToSquared(eye)>travel*travel || Math.abs(reflectedRotation.dot(camera.quaternion))<.9998){
      const mirror=surface.getReflectionCamera(camera);
      mirror.layers.set(0);
      reflectionCameras.add(mirror);
      reflect(...args);
      reflectedAt=clock.value;
      reflectedEye.copy(eye);reflectedRotation.copy(camera.quaternion);reflectedProjection.copy(camera.projectionMatrix);
      worldToReflection.multiplyMatrices(uvMatrix,inverse.copy(surface.matrixWorld).invert());
    }else{
      uvMatrix.multiplyMatrices(worldToReflection,surface.matrixWorld);
    }
    reflectionEnabled.value=1;
  };
  return {surface,material};
}

export const waterNoise=`
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

  float waterFresnel(vec3 eye,vec3 normal){
    return .0204+.9796*pow(1.-clamp(dot(eye,normal),0.,1.),5.);
  }

  float waterGlint(vec3 normal,vec3 halfAngle,float roughness){
    float a=roughness*roughness,nh=max(dot(normal,halfAngle),0.);
    float denominator=1.-nh*nh+a*nh*nh;
    return .0058*a/max(.00001,denominator*denominator);
  }
`;

export const rainImpactRipples=`
  vec4 dropRandom(vec2 cell,uint cycle){
    uvec2 address=uvec2(ivec2(cell));
    uint bits=(address.x*1597334677u)^(address.y*3812015801u)^(cycle*2798796415u);
    bits=(bits^(bits>>16u))*0x7feb352du;
    bits=(bits^(bits>>15u))*0x846ca68bu;
    bits=bits^(bits>>16u);
    return vec4(uvec4(bits,bits>>8u,bits>>16u,bits>>24u)&255u)/255.;
  }

  vec3 impactRipple(vec2 grid,vec2 cell,float clock,float density,float band){
    vec4 rhythm=dropRandom(cell,0u);
    float cycle=clock*mix(.95,2.15,rhythm.x)+rhythm.y;
    vec4 drop=dropRandom(cell,1u+uint(floor(cycle)));
    float age=fract(cycle)/mix(.52,.90,drop.z);
    if(age>=1. || drop.w>density+.09)return vec3(0.);

    vec2 center=cell+drop.xy+age*vec2(.006,-.019);
    vec2 delta=grid-center;
    delta.x*=1.+.09*rhythm.z;
    float distanceToHit=length(delta);
    float size=mix(.105,.329,drop.z*(.5+.5*drop.z));
    float crest=distanceToHit-(.017+size*sqrt(age));
    float profile=crest/band;
    float ring=exp(-profile*profile)*(1.-smoothstep(1.45,2.,abs(profile)));
    float life=smoothstep(.0,.12,age)*(1.-smoothstep(.39,1.,age));
    float energy=life*smoothstep(drop.w-.09,drop.w+.08,density)*mix(.37,1.15,drop.z);
    vec2 radial=delta/max(.01,distanceToHit);
    float crescent=pow(max(0.,dot(radial,vec2(.51,-.86))),3.);
    return energy*vec3(-2.*profile*ring*radial,ring*(.13+.87*crescent));
  }

  vec3 rainRipples(vec2 p,float clock,float footprint,float rain,float breeze){
    if(rain<.003 || footprint>=.26)return vec3(0.);
    vec2 grid=p*1.96;
    vec2 cell=floor(grid);
    vec2 neighbor=2.*step(.5,fract(grid))-1.;
    float density=rain*mix(.57,.95,breeze*breeze);
    float band=clamp(.019+footprint*.69,.023,.057);
    vec3 hits=impactRipple(grid,cell,clock,density,band)+
      impactRipple(grid,cell+vec2(neighbor.x,0.),clock,density,band)+
      impactRipple(grid,cell+vec2(0.,neighbor.y),clock,density,band)+
      impactRipple(grid,cell+neighbor,clock,density,band);
    return hits*rain*(1.-smoothstep(.066,.26,footprint));
  }
`;
