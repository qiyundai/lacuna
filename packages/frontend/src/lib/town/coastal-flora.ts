import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function crownBounds(source:T.BufferGeometry) {
  const shape=new T.BufferGeometry();
  shape.setAttribute('position',source.getAttribute('position'));
  shape.setIndex(source.index);
  const welded=mergeVertices(shape), pos=welded.getAttribute('position'), idx=welded.index!;
  const parent=Array.from({length:pos.count},(_,i)=>i);
  function root(i:number):number {
    while(parent[i]!==i){parent[i]=parent[parent[i]!]!;i=parent[i]!;}
    return i;
  }
  for(let i=0;i<idx.count;i+=3){
    const a=root(idx.getX(i));
    parent[root(idx.getX(i+1))]=a;parent[root(idx.getX(i+2))]=a;
  }
  const bounds=new Map<number,T.Box3>(),point=new T.Vector3();
  for(let i=0;i<pos.count;i++){
    const id=root(i), box=bounds.get(id)??new T.Box3();
    box.expandByPoint(point.fromBufferAttribute(pos,i));bounds.set(id,box);
  }
  welded.dispose();shape.dispose();
  return [...bounds.values()];
}

function noise(seed:number) {
  return T.MathUtils.euclideanModulo(Math.sin(seed*127.1+31.7)*43758.5453,1);
}

function foliageStamp(pine:boolean) {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='black';ctx.fillRect(0,0,128,128);
  ctx.fillStyle='white';ctx.strokeStyle='white';ctx.lineCap='round';
  for(let sprig=0;sprig<8;sprig++){
    const angle=-Math.PI*.5+(sprig-3.5)*.52+.11*noise(sprig);
    const reach=40+16*noise(sprig+8);
    const rootX=64+6*Math.sin(angle),rootY=73;
    const dx=Math.cos(angle),dy=Math.sin(angle);
    ctx.lineWidth=1.9;ctx.beginPath();ctx.moveTo(rootX,rootY);
    ctx.lineTo(rootX+dx*reach,rootY+dy*reach);ctx.stroke();
    for(let leaf=0;leaf<16;leaf++){
      const t=.12+.055*leaf;
      const side=leaf%2?1:-1;
      const offset=(3+8*Math.sin(t*Math.PI))*side;
      const x=rootX+dx*t*reach-dy*offset,y=rootY+dy*t*reach+dx*offset;
      ctx.beginPath();
      ctx.ellipse(x,y,pine?10:5+2.9*noise(sprig*31+leaf),pine?2.0:3.7,
        angle+side*.69,0,Math.PI*2);ctx.fill();
    }
  }
  const texture=new T.CanvasTexture(canvas);
  return texture;
}

function leafClusters(source:T.BufferGeometry,pine:boolean) {
  const pos:number[]=[],normals:number[]=[],colors:number[]=[],uv:number[]=[],indices:number[]=[];
  const branches:T.BufferGeometry[]=[];
  for(const [id,box] of crownBounds(source).entries()){
    const center=box.getCenter(new T.Vector3()),radius=box.getSize(new T.Vector3()).multiplyScalar(.5);
    const count=pine?15:16;
    for(let i=0;i<count;i++){
      const seed=id*103+i,az=i*2.39996+id*.7;
      const y=2*(i+.5)/count-1;
      const spread=pine?(.36+.66*(1-y)*.5):Math.sqrt(1-y*y);
      const axis=new T.Vector3(Math.cos(az),0,Math.sin(az));
      const at=center.clone().add(new T.Vector3(axis.x*radius.x*spread,y*radius.y,axis.z*radius.z*spread).multiplyScalar(.94));
      const width=(.48+.20*noise(seed+9))*Math.max(radius.x,radius.z)*(pine?.90:1.2);
      const height=Math.max(radius.y*.41,width*(pine?.29:.68));
      const collar=new T.Vector3(center.x*.38,center.y-radius.y*(.79-.34*y),center.z*.38);
      const reach=at.clone().sub(collar);
      const branch=new T.CylinderGeometry(width*.026,width*.076,reach.length(),5,1,true);
      branch.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),reach.normalize()));
      const mid=at.clone().lerp(collar,.5);
      branches.push(branch.translate(mid.x,mid.y,mid.z));
      const tint=.55+.27*(y+1)*.5+.23*noise(seed+3);
      for(let fan=0;fan<3;fan++){
        const angle=az+fan*1.05;
        const across=new T.Vector3(Math.cos(angle),.14*(noise(seed+fan)-.5),Math.sin(angle)).multiplyScalar(width);
        const up=new T.Vector3(axis.x*.36,fan===2?.56:.95,axis.z*.36).multiplyScalar(height);
        const outward=new T.Vector3(Math.sin(angle),.32+y*.30,-Math.cos(angle)).normalize();
        const first=pos.length/3;
        for(const [u,v] of [[0,0],[1,0],[1,1],[0,1],[.5,.5]] as const){
          const p=at.clone().addScaledVector(across,2*u-1).addScaledVector(up,2*v-1);
          if(u===.5)p.addScaledVector(outward,width*.47);
          const normal=p.clone().sub(at).multiplyScalar(1.4/width).add(outward).normalize();
          pos.push(p.x,p.y,p.z);uv.push(u,v);normals.push(normal.x,normal.y,normal.z);
          colors.push(tint*(.65+.47*v),tint*(.82+.34*v),tint*(1.02-.12*v));
        }
        for(let edge=0;edge<4;edge++)indices.push(first+edge,first+(edge+1)%4,first+4);
      }
    }
  }
  const g=new T.BufferGeometry();
  g.setIndex(indices);
  for(const [key,arr,size] of [['position',pos,3],['normal',normals,3],['color',colors,3],['uv',uv,2]] as const)
    g.setAttribute(key,new T.Float32BufferAttribute(arr,size));
  const wood=mergeGeometries(branches);
  for(const branch of branches)branch.dispose();
  return {leaves:g,wood};
}

export async function loadCoastalTrees(materials:{leaf:T.MeshStandardMaterial;needle:T.MeshStandardMaterial;bark:T.Material}) {
  const loader=new GLTFLoader(), owned=new Set<T.BufferGeometry>();
  const stamps=[foliageStamp(false),foliageStamp(true)];
  for(const [index,material] of [materials.leaf,materials.needle].entries()){
    material.alphaMap=stamps[index]!;
    const prepare=material.onBeforeCompile.bind(material);
    material.onBeforeCompile=(shader,renderer)=>{
      prepare(shader,renderer);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n normal*=faceDirection;');
    };
    material.alphaTest=.30;
    material.shadowSide=T.DoubleSide;
  }
  const trees=await Promise.all(['tree_detailed_fall','tree_oak','tree_pineRoundA'].map(async(name,index)=>{
    const source=await loader.loadAsync('/town/land/'+name+'.glb').catch(()=>undefined);
    if(!source) return;
    const tree=new T.Group(),pine=index===2;
    source.scene.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(source.scene);
    const scale=1/(bounds.max.y-bounds.min.y);
    source.scene.traverse(node=>{
      if(!(node instanceof T.Mesh)) return;
      const label=node.material.name as string;
      if(/leaf|wood/i.test(label)) {
        const leaf=/leaf/i.test(label);
        function addPart(g:T.BufferGeometry,material:T.Material){
          g.applyMatrix4(node.matrixWorld);g.translate(0,-bounds.min.y,0);g.scale(scale,scale,scale);
          owned.add(g);tree.add(new T.Mesh(g,material));
        }
        if(leaf){
          const {leaves,wood}=leafClusters(node.geometry,pine);
          addPart(leaves,pine?materials.needle:materials.leaf);
          addPart(wood,materials.bark);
        }else addPart(node.geometry.clone(),materials.bark);
      }
      node.geometry.dispose();node.material.dispose();
    });
    return tree;
  }));
  return {trees,dispose(){for(const g of owned)g.dispose();for(const stamp of stamps)stamp.dispose();}};
}
