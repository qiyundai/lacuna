import * as T from 'three';
import { fullDetailEnd, boughEnd, reducedDetailStart, treePasses } from './tree-dither.js';

export const distantTreeGeometry=new WeakMap<T.BufferGeometry,T.BufferGeometry>();

export function batchPlantings(geometry:T.BufferGeometry,material:T.Material,matrices:T.Matrix4[],tints?:T.Color[],fadeToBoughs=false){
  function instances(shape:T.BufferGeometry,indices:number[],center:T.Vector3,detail?:'full'|'reduced'|'single'){
    const passes=detail?treePasses(material,detail):undefined;
    const mesh=new T.InstancedMesh(shape,passes?.color??material,indices.length);
    if(passes){
      mesh.customDepthMaterial=passes.depth;
      mesh.onBeforeShadow=(_renderer,_object,camera)=>{passes.shadowEye.setFromMatrixPosition(camera.matrixWorld);};
    }
    const local=new T.Matrix4(),point=new T.Vector3();
    for(const [slot,i] of indices.entries()){
      local.copy(matrices[i]);
      point.setFromMatrixPosition(local).sub(center);local.setPosition(point);
      mesh.setMatrixAt(slot,local);
      if(tints)mesh.setColorAt(slot,tints[i]);
    }
    mesh.castShadow=!material.transparent;mesh.receiveShadow=true;
    mesh.computeBoundingSphere();
    if(distantTreeGeometry.has(geometry))mesh.boundingSphere!.radius+=1.2;
    return mesh;
  }
  const distant=distantTreeGeometry.get(geometry);
  const point=new T.Vector3();
  if(!distant)return instances(geometry,matrices.map((_,i)=>i),point,fadeToBoughs?'single':undefined);
  const cells=new Map<string,number[]>();
  for(const [i,matrix] of matrices.entries()){
    point.setFromMatrixPosition(matrix);
    const key=Math.floor(point.x/14)+','+Math.floor(point.z/14);
    const cell=cells.get(key);
    if(cell)cell.push(i);else cells.set(key,[i]);
  }
  const group=new T.Group();
  for(const indices of cells.values()){
    const lod=new T.LOD();
    let height=0,minHeight=Infinity,radius=0;
    for(const i of indices){
      lod.position.add(point.setFromMatrixPosition(matrices[i]));
      const h=point.setFromMatrixColumn(matrices[i],1).length();
      height=Math.max(height,h);minHeight=Math.min(minHeight,h);
    }
    lod.position.divideScalar(indices.length);
    for(const i of indices)radius=Math.max(radius,point.setFromMatrixPosition(matrices[i]).distanceTo(lod.position));
    const near=instances(geometry,indices,lod.position,'full'),far=instances(distant,indices,lod.position,'reduced');
    lod.addLevel(near,0);
    lod.addLevel(far,12+height*2.8);
    const center=new T.Vector3(),offset=new T.Vector3();
    lod.update=camera=>{
      center.setFromMatrixPosition(lod.matrixWorld);
      offset.setFromMatrixPosition(camera.matrixWorld).sub(center);
      const scale=lod.matrixWorld.getMaxScaleOnAxis(),spread=radius*scale;
      const distance=offset.length();
      const inMeshRange=Math.hypot(offset.x,offset.z)-spread<boughEnd;
      near.visible=inMeshRange && distance-spread<(12+height*scale*2.8)*fullDetailEnd;
      far.visible=inMeshRange && distance+spread>(12+minHeight*scale*2.8)*reducedDetailStart;
    };
    group.add(lod);
  }
  return group;
}
