import * as T from 'three';

export const boughStart=112,boughEnd=188;
export const farCrownStart=480,farCrownEnd=740,woodlandEnd=2370;
export const fullDetailEnd=1.24,reducedDetailStart=.76;

export const treeDither=`
  float treePixelRank(vec2 pixel){return fract(52.9829189*fract(dot(pixel,vec2(.06711056,.00583715))));}
  void clipTreeCoverage(vec2 interval){
    if(interval.y<=interval.x)discard;
    if(interval.x<=0. && interval.y>=1.)return;
    float rank=treePixelRank(floor(gl_FragCoord.xy));
    if(rank<interval.x || rank>=interval.y)discard;
  }
`;

type Detail='full'|'reduced'|'single';
type TreePasses={color:T.Material;depth:T.MeshDepthMaterial;shadowEye:T.Vector3};
const passesBySource=new WeakMap<T.Material,Map<string,TreePasses>>();

export function treePasses(source:T.Material,detail:Detail){
  const variants=passesBySource.get(source)??new Map<string,TreePasses>();
  if(!passesBySource.has(source)){
    passesBySource.set(source,variants);
    source.addEventListener('dispose',()=>{
      for(const pass of variants.values()){pass.color.dispose();pass.depth.dispose();}
      variants.clear();
    });
  }
  const key=detail;
  const cached=variants.get(key);
  if(cached)return cached;
  const color=source.clone(),depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});
  const shadowEye=new T.Vector3();
  for(const pass of [color,depth]){
    const shadow=pass===depth;
    pass.customProgramCacheKey=()=>source.customProgramCacheKey()+'/tree/'+key+(shadow?'/depth':'');
    pass.onBeforeCompile=(shader,renderer)=>{
      if(!shadow)source.onBeforeCompile(shader,renderer);
      if(shadow)shader.uniforms.treeEye={value:shadowEye};
      shader.vertexShader=(shadow?'uniform vec3 treeEye;\n':'')+'varying vec2 treeCoverage;\n'+shader.vertexShader
        .replace('void main() {',`void main() {
          mat4 planting=modelMatrix*instanceMatrix;
          vec3 offsetToEye=${shadow?'treeEye':'cameraPosition'}-planting[3].xyz;
          float bough=smoothstep(${boughStart}.,${boughEnd}.,length(offsetToEye));
          float reach=12.+2.8*length(planting[1].xyz);
          float reduced=mix(bough,1.,smoothstep(reach*${reducedDetailStart},reach*${fullDetailEnd},length(offsetToEye)));
          treeCoverage=${detail==='full'?'vec2(reduced,1.)':detail==='reduced'?'vec2(bough,reduced)':'vec2(bough,1.)'};
          if(treeCoverage.y<=treeCoverage.x){gl_Position=vec4(2.,2.,2.,1.);return;}
        `);
      shader.fragmentShader='varying vec2 treeCoverage;\n'+treeDither+shader.fragmentShader
        .replace('#include <alphahash_fragment>','#include <alphahash_fragment>\n clipTreeCoverage(treeCoverage);');
    };
  }
  const passes={color,depth,shadowEye};variants.set(key,passes);return passes;
}
