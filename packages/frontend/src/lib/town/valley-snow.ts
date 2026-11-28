import * as T from 'three';

export const snowSurface = `
  uniform float snowCover;

  float snowGrain(vec2 cell){
    vec3 p=fract(vec3(cell.xyx)*vec3(.1031,.1030,.0973));
    p+=dot(p,p.yzx+31.32);
    return fract((p.x+p.y)*p.z);
  }

  float snowNoise(vec2 point){
    vec2 cell=floor(point),f=fract(point);
    f=f*f*(3.-2.*f);
    return mix(mix(snowGrain(cell),snowGrain(cell+vec2(1.,0.)),f.x),
               mix(snowGrain(cell+vec2(0.,1.)),snowGrain(cell+1.),f.x),f.y);
  }

  float settledSnow(vec3 point,float slope,float exposed,float grain){
    float ledge=smoothstep(.13,.68,slope);
    float wind=grain+.19*snowNoise(point.xz*.72+point.y*.26);
    float fill=smoothstep(.64-.73*snowCover,.89-.73*snowCover,wind);
    return ledge*fill*exposed*smoothstep(0.,.58,snowCover);
  }

  vec3 snowColor(float grain){
    return mix(vec3(.63,.72,.76),vec3(.89,.91,.90),grain);
  }
`;

export type SnowShelter={source:string; functionName:string};

export function snowOnMeshes(snowCover:T.IUniform<number>,exposure?:SnowShelter,glass=false){
  const prepared=new WeakSet<T.Material>();
  return (root:T.Object3D)=>{
    root.traverse(object=>{
      if(!(object instanceof T.Mesh) || object.geometry.hasAttribute('leafMask'))return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const material of materials){
        const pbr=material instanceof T.MeshStandardMaterial;
        if((!pbr && !(material instanceof T.MeshLambertMaterial)) || prepared.has(material) || (material.transparent && !glass))continue;
        prepared.add(material);
        const prepare=material.onBeforeCompile.bind(material);
        const key=material.customProgramCacheKey();
        const transparent=material.transparent;
        material.customProgramCacheKey=()=>key+'/settled-snow/'+(exposure?.functionName??'open')+'/'+Number(transparent);
        material.needsUpdate=true;
        material.onBeforeCompile=(shader,renderer)=>{
          prepare(shader,renderer);
          if(shader.uniforms.snowCover===snowCover)return;
          shader.uniforms.snowCover=snowCover;
          shader.vertexShader=`
            uniform float snowCover;
            varying vec3 snowPoint;
            varying float snowUp;
            ${exposure?'varying vec3 shelterPoint;':''}
          `+shader.vertexShader.replace('#include <project_vertex>',`
            if(snowCover>.001){
              vec4 winterPoint=vec4(transformed,1.);
              #ifdef USE_INSTANCING
                winterPoint=instanceMatrix*winterPoint;
              #endif
              snowPoint=(modelMatrix*winterPoint).xyz;
              snowUp=dot(normalize(transformedNormal),viewMatrix[1].xyz);
              ${exposure?'shelterPoint=transformed;':''}
            }
            #include <project_vertex>
          `);
          shader.fragmentShader=snowSurface+`
            varying vec3 snowPoint;
            varying float snowUp;
            ${exposure?'varying vec3 shelterPoint;'+exposure.source:''}
          `+shader.fragmentShader.replace('#include <normal_fragment_begin>',`
            if(snowCover>.001 && snowUp>.13){
              float grain=snowNoise(snowPoint.xz*.29+snowPoint.y*.09);
              float coat=settledSnow(snowPoint,snowUp,${exposure?exposure.functionName+'(shelterPoint)':'1.'},grain);
              diffuseColor.rgb=mix(diffuseColor.rgb,snowColor(grain),coat);
              ${pbr?'roughnessFactor=mix(roughnessFactor,.97,coat);metalnessFactor*=1.-coat;':''}
              ${transparent?'diffuseColor.a=mix(diffuseColor.a,.91,coat*.89);':''}
            }
            #include <normal_fragment_begin>
          `);
        };
      }
    });
  };
}
