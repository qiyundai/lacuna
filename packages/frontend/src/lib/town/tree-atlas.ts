import * as T from 'three';

const views=4, elevations=2, cell=128;
export const treePortraitSpan=1.65;

export type TreeAtlas = {
  albedo:T.WebGLRenderTarget;
  normals:T.WebGLRenderTarget;
  dispose:()=>void;
};

export function renderTreeAtlas(renderer:T.WebGLRenderer,trees:T.Group[]):TreeAtlas{
  const makeTarget=()=>new T.WebGLRenderTarget(cell*views,cell*elevations*trees.length,{
    minFilter:T.LinearMipmapLinearFilter,generateMipmaps:true
  });
  const albedo=makeTarget(),normals=makeTarget();
  const scene=new T.Scene();
  const half=treePortraitSpan/2,camera=new T.OrthographicCamera(-half,half,half,-half,.05,8);
  const previous=renderer.getRenderTarget(),clear=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha();
  function bake(target:T.WebGLRenderTarget,output:string){
    const materials=new Map<T.Material,T.Material>();
    function capture(source:T.Material){
      const existing=materials.get(source);
      if(existing)return existing;
      const material=source.clone();
      material.onBeforeCompile=(shader,context)=>{
        source.onBeforeCompile(shader,context);
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
          `outgoingLight=${output};\n#include <opaque_fragment>`);
      };
      material.customProgramCacheKey=()=>source.customProgramCacheKey()+output;
      materials.set(source,material);
      return material;
    }
    try{
      for(const [species,tree] of trees.entries()){
        const model=tree.clone();
        model.traverse(part=>{
          if(part instanceof T.Mesh)part.material=Array.isArray(part.material)?part.material.map(capture):capture(part.material);
        });
        scene.add(model);
        for(let elevation=0;elevation<elevations;elevation++)for(let face=0;face<views;face++){
          const angle=face*Math.PI*2/views,pitch=(elevation===0?12:58)*Math.PI/180;
          camera.position.set(3*Math.sin(angle)*Math.cos(pitch),.5+3*Math.sin(pitch),3*Math.cos(angle)*Math.cos(pitch));
          camera.lookAt(0,.5,0);
          target.viewport.set(face*cell,(species*elevations+elevation)*cell,cell,cell);
          target.scissor.copy(target.viewport);target.scissorTest=true;
          renderer.setRenderTarget(target);
          renderer.render(scene,camera);
        }
        scene.remove(model);
      }
    }finally{
      for(const material of materials.values())material.dispose();
    }
  }
  function dispose(){albedo.dispose();normals.dispose();}
  try{
    renderer.setClearColor(0x000000,0);
    bake(albedo,'diffuseColor.rgb');
    bake(normals,'inverseTransformDirection(normal,viewMatrix)*.5+.5');
  }catch(error){
    dispose();
    throw error;
  }finally{
    renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);
  }
  return {albedo,normals,dispose};
}
