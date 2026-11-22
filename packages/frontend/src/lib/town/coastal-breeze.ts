import type * as T from 'three';

export const coastalBreeze = `
  uniform float breezeTime;
  const vec2 breezeDirection=vec2(.923,.385);
  float meadowWave(vec2 ground,float seconds){
    float front=dot(ground,vec2(.058,-.092))-seconds*.86
      +1.08*sin(ground.x*.034+ground.y*.021)+.63*sin(ground.y*.047-seconds*.14);
    return smoothstep(-.60,.88,sin(front))*(.73+.27*cos(ground.x*.052-ground.y*.031));
  }
  float breezeAt(vec2 ground,float seconds) {
    float along=dot(ground,breezeDirection)-seconds*3.35;
    float across=dot(ground,vec2(-breezeDirection.y,breezeDirection.x));
    float front=.43*along+1.16*sin(.25*across+.10*along)+.60*sin(.39*across-.13*along);
    float crest=.5+.5*cos(front);
    float shoulder=.5+.5*cos(front*2.12+.32*across);
    float pocket=smoothstep(-.84,.75,sin(.27*across+.12*along)+.40*cos(.18*along-.14*across));
    return .57*meadowWave(ground,seconds)+.43*(.78*smoothstep(.12,.94,crest)+.22*shoulder)*(.46+.54*pocket);
  }
`;

export const treeFlex=.072;

export const canopySway=`
  vec2 canopySway(vec2 root,vec2 branch,float heightFraction,float seconds){
    float tip=smoothstep(.18,1.,heightFraction);
    float phase=dot(root,vec2(.058,-.092))-seconds*1.08;
    float gust=.72+.28*sin(phase*.41+root.x*.028);
    float lean=.18+gust*sin(phase);
    float flutter=.22*sin(phase*2.21+dot(branch,vec2(.58,.93))+heightFraction*2.6);
    return tip*(vec2(.923,.385)*lean+vec2(-.385,.923)*flutter);
  }
`;

export function stirCanopy(material:T.MeshStandardMaterial|T.MeshLambertMaterial,clock:T.IUniform<number>,flexibility:number) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.breezeTime=clock;
    shader.uniforms.crownFlex={value:flexibility};
    shader.vertexShader=canopySway+'uniform float breezeTime,crownFlex;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      mat4 treeFrame=modelMatrix;
      #ifdef USE_INSTANCING
        treeFrame*=instanceMatrix;
      #endif
      vec3 rest=(treeFrame*vec4(position,1.)).xyz;
      float rise=length(treeFrame[1].xyz);
      vec2 root=treeFrame[3].xz;
      vec2 sway=crownFlex*rise*canopySway(root,rest.xz-root,position.y,breezeTime);
      vec3 offset=vec3(sway.x,0.,sway.y);
      mat3 axes=mat3(treeFrame);
      vec3 scaleSq=vec3(dot(axes[0],axes[0]),dot(axes[1],axes[1]),dot(axes[2],axes[2]));
      transformed+=(offset*axes)/max(scaleSq,vec3(.000001));
    `);
  };
}

export function stirGroundPlants(material:T.MeshStandardMaterial,clock:T.IUniform<number>,flex:number,root=0){
  const prepare=material.onBeforeCompile.bind(material);
  const key=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>key+'/ground-plant/'+flex+'/'+root;
  material.onBeforeCompile=(shader,renderer)=>{
    prepare(shader,renderer);
    shader.uniforms.breezeTime=clock;
    shader.vertexShader=coastalBreeze+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      mat4 plantFrame=modelMatrix;
      #ifdef USE_INSTANCING
        plantFrame*=instanceMatrix;
      #endif
      vec3 place=(plantFrame*vec4(position,1.)).xyz;
      float stem=max(0.,position.y-${root.toFixed(3)});
      float gust=breezeAt(place.xz,breezeTime);
      vec2 shift=breezeDirection*stem*length(plantFrame[1].xyz)*${flex.toFixed(3)}*
        (.45+gust)*sin(dot(place.xz,vec2(.058,-.092))-breezeTime*1.08);
      mat3 axes=mat3(plantFrame);
      vec3 scaleSq=vec3(dot(axes[0],axes[0]),dot(axes[1],axes[1]),dot(axes[2],axes[2]));
      transformed+=(vec3(shift.x,0.,shift.y)*axes)/max(scaleSq,vec3(.000001));
    `);
  };
}
