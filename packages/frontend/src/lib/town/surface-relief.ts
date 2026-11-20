import * as T from 'three';

export const reliefNormal = `
  vec3 surfaceNormal(vec3 face, vec3 viewPoint, float height) {
    vec3 dx=dFdx(viewPoint), dy=dFdy(viewPoint);
    vec3 u=cross(dy,face), v=cross(face,dx);
    float area=dot(dx,u);
    return normalize(face-sign(area)*(dFdx(height)*u+dFdy(height)*v)/max(abs(area),.0000001));
  }
`;

export function finishBuilding(material: T.MeshStandardMaterial, relief: T.Texture) {
  material.customProgramCacheKey=()=>'waterfront-building-relief';
  material.onBeforeCompile=shader=>{
    shader.uniforms.surfaceRelief={value:relief};
    shader.vertexShader='attribute float surfaceKind; varying float kind; varying vec3 partPoint, partNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      kind=surfaceKind; partPoint=position; partNormal=normal;
    `);
    shader.fragmentShader='uniform sampler2D surfaceRelief; varying float kind; varying vec3 partPoint, partNormal;\n'+reliefNormal+shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      float skinHeight=0.;
      {
      vec3 orientation=abs(normalize(partNormal));
      vec2 wall=orientation.x>orientation.z?partPoint.zy:partPoint.xy;
      vec2 materialUv=orientation.y>.85?partPoint.xz:wall;
      float plaster=texture2D(surfaceRelief,materialUv*.42).r;
      if(kind>.5 && kind<1.5) {
        skinHeight=.035*plaster;
        diffuseColor.rgb*=.92+.16*plaster;
      } else if(kind>1.5 && kind<2.5) {
        vec2 course=materialUv/vec2(.81,.34);
        course.x+=.5*mod(floor(course.y),2.);
        vec2 edge=abs(fract(course+.5)-.5);
        float block=smoothstep(.015,.08,edge.x)*smoothstep(.018,.12,edge.y);
        float exposed=(1.-smoothstep(.10,.35,fwidth(materialUv.y/.34)))*(1.-smoothstep(.65,.9,orientation.y));
        skinHeight=.024*plaster+.021*block*exposed;
        diffuseColor.rgb*=1.-.15*(1.-block)*exposed;
      } else if(kind>2.5 && orientation.y>.15) {
        vec2 fall=partNormal.xz;
        fall=length(fall)>.01?normalize(fall):vec2(0.,1.);
        vec2 tile=vec2(dot(partPoint.xz,vec2(fall.y,-fall.x))/.33,dot(partPoint.xz,fall)/.42);
        float course=fract(tile.y);
        float lap=smoothstep(.015,.16,course)*(1.-.64*course);
        float ridge=.5+.5*cos(6.28318*(tile.x+.5*mod(floor(tile.y),2.)));
        float detail=1.-smoothstep(.15,.54,max(fwidth(tile.x),fwidth(tile.y)));
        skinHeight=(lap*.045+ridge*.027)*detail;
        diffuseColor.rgb*=1.+(.15*(lap-.5)+.10*(ridge-.5))*detail;
      }
      }
    `).replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      normal=surfaceNormal(normal,-vViewPosition,skinHeight);
    `);
  };
}
