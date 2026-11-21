import { boughEnd, farCrownStart, farCrownEnd, woodlandEnd } from './tree-dither.js';
import { batchPlantings } from './tree-batches.js';
import * as T from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import type { ValleyLighting } from './bay-world.js';
import { crownNeighbors, woodlandBoughs, type WoodlandTree } from './woodland-boughs.js';
import { meadowPigment } from './meadow-pigment.js';
import { coastalBreeze } from './coastal-breeze.js';
import type { Gouache } from './gouache.js';
import { shoreline, riverWidth, valleyOrigin } from './valley-river.js';

const noise=new ImprovedNoise();

export function woodlandAt(x:number,z:number,height:number,cityEnd:number){
  const station=valleyOrigin.z-z;
  const west=shoreline(station)+valleyOrigin.x-x;
  const depth=Math.max(west,-riverWidth(station)-west);
  const street=z<218 && z>valleyOrigin.z-cityEnd-16 && depth>=-2 ? T.MathUtils.smoothstep(depth,39,55) : 1;
  const overlook=T.MathUtils.smoothstep(Math.hypot((x-70)*.85,z-491),38,89);
  const stand=.66*noise.noise(x*.020,z*.017,8)+.34*noise.noise(x*.047,z*.041,3);
  return street*overlook*T.MathUtils.smoothstep(height,.9,3.8)*T.MathUtils.smoothstep(stand,-.33,.19);
}

function random(x:number,z:number,salt:number){
  let h=Math.imul(x,374761393)+Math.imul(z,668265263)+Math.imul(salt,144269);
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967296;
}

type Surface=(x:number,z:number)=>number;
type Tile={mesh:T.Object3D;dispose:()=>void};

function tileRing(size:number,radius:number,west:number,east:number,make:(x:number,z:number)=>Tile|null){
  const group=new T.Group(),tiles=new Map<string,Tile|null>();
  let lastX=Infinity,lastZ=Infinity;
  function clear(){
    for(const tile of tiles.values())tile?.dispose();
    group.clear();tiles.clear();lastX=lastZ=Infinity;
  }
  function view(eye:T.Vector3){
    const x=Math.floor(eye.x/size),z=Math.floor(eye.z/size);
    if(x===lastX&&z===lastZ)return;
    lastX=x;lastZ=z;
    const active=new Set<string>();
    for(let i=Math.max(Math.floor(west/size),x-radius);i<=Math.min(Math.floor(east/size),x+radius);i++){
      for(let j=z-radius;j<=z+radius;j++){
        const key=i+','+j;active.add(key);
        if(tiles.has(key))continue;
        const tile=make(i,j);tiles.set(key,tile);if(tile)group.add(tile.mesh);
      }
    }
    for(const [key,tile] of tiles)if(!active.has(key)){
      if(tile){group.remove(tile.mesh);tile.dispose();}tiles.delete(key);
    }
  }
  return {group,view,clear};
}

type Cover=(x:number,z:number,height:number)=>number;

export const groveCell=80/21;
const nearCells=7,nearRadius=Math.ceil(boughEnd/(nearCells*groveCell));

export function forestTrees(i:number,j:number,cells:number,height:Surface,coverAt:Cover,west:number,east:number,halo=0){
  const trees:WoodlandTree[]=[];
  for(let a=-halo;a<cells+halo;a++)for(let b=-halo;b<cells+halo;b++){
    const ix=i*cells+a,iz=j*cells+b;
    const x=(ix+random(ix,iz,1))*groveCell,z=(iz+random(ix,iz,2))*groveCell;
    if(x<west||x>east)continue;
    const y=height(x,z),cover=coverAt(x,z,y);
    if(random(ix,iz,3)>=cover*.90)continue;
    const seed=random(ix,iz,4);
    const species=Math.floor(seed*3),size=2.8+cover*3.6+random(ix,iz,5)*4.1;
    trees.push({ix,iz,x,y:y-.15-.035*size,z,species,yaw:seed*2*Math.PI+species*2.39996,spread:.96+.16*Math.sin(species),size});
  }
  return trees;
}

export function treeMeshes(trees:WoodlandTree[],models:T.Group[]){
  const group=new T.Group(),pose=new T.Object3D();
  models.forEach((model,species)=>{
    const stand=trees.filter(t=>t.species%models.length===species);
    if(!stand.length)return;
    const roots=stand.map(t=>{
      pose.position.set(t.x,t.y,t.z);pose.rotation.y=t.yaw;
      pose.scale.set(t.size*t.spread,t.size,t.size*t.spread);
      pose.updateMatrix();return pose.matrix.clone();
    });
    model.traverse(part=>{
      if(!(part instanceof T.Mesh))return;
      const matrices=roots.map(root=>root.clone().multiply(part.matrixWorld));
      group.add(batchPlantings(part.geometry,part.material,matrices,undefined,true));
    });
  });
  return group;
}

export function corridorForest(models:T.Group[],height:Surface,coverAt:Cover,west:number,east:number){
  for(const model of models)model.updateMatrixWorld(true);
  const roots=new WeakMap<T.Object3D,T.Box3>(),point=new T.Vector3();
  const ring=tileRing(nearCells*groveCell,nearRadius,west,east,(i,j)=>{
    const trees=forestTrees(i,j,nearCells,height,coverAt,west,east);
    if(!trees.length)return null;
    const group=treeMeshes(trees,models);
    const bounds=new T.Box3();
    for(const tree of trees)bounds.expandByPoint(point.set(tree.x,tree.y,tree.z));
    roots.set(group,bounds);
    return {mesh:group,dispose(){group.traverse(mesh=>{if(mesh instanceof T.InstancedMesh)mesh.dispose();});}};
  });
  return {...ring,view(eye:T.Vector3){
    ring.view(eye);
    for(const tile of ring.group.children)tile.visible=roots.get(tile)!.distanceToPoint(eye)<boughEnd;
  }};
}

export function distantCrowns(height:Surface,coverAt:Cover,west:number,east:number,lighting:ValleyLighting,
  clock:T.IUniform<number>,eye:T.Vector3,sprays:T.Texture|null,paint?:Gouache){
  const boughs=woodlandBoughs(lighting,clock,eye,sprays,paint);
  function ring(cells:number,reach:number,level:number){
    const radius=Math.ceil(reach/(cells*groveCell));
    return tileRing(cells*groveCell,radius,west,east,(i,j)=>{
      const trees=forestTrees(i,j,cells,height,coverAt,west,east,2);
      const neighbors=crownNeighbors(trees);
      const planted=trees.filter(t=>Math.floor(t.ix/cells)===i && Math.floor(t.iz/cells)===j);
      return boughs.tile(planted,neighbors,level);
    });
  }
  const middle=ring(21,farCrownEnd,0),far=ring(32,woodlandEnd,1);
  const group=new T.Group();group.add(middle.group,far.group);
  function clear(){middle.clear();far.clear();}
  function view(camera:T.Vector3){
    for(const [band,inner,outer] of [[middle,0,farCrownEnd],[far,farCrownStart,woodlandEnd]] as const){
      band.view(camera);
      for(const tile of band.group.children){
        const box=(tile as T.Mesh).geometry.boundingBox!;
        const x=Math.max(box.min.x-camera.x,0,camera.x-box.max.x),z=Math.max(box.min.z-camera.z,0,camera.z-box.max.z);
        const farX=Math.max(Math.abs(camera.x-box.min.x),Math.abs(camera.x-box.max.x));
        const farZ=Math.max(Math.abs(camera.z-box.min.z),Math.abs(camera.z-box.max.z));
        tile.visible=x*x+z*z<outer*outer && farX*farX+farZ*farZ>inner*inner;
      }
    }
  }
  return {group,clear,view,boughs,dispose(){clear();boughs.dispose();}};
}

export function corridorGrass(height:Surface,hasTownLawn:(x:number,z:number)=>boolean,west:number,east:number,
  breezeTime:T.IUniform<number>,eye:T.Vector3,coverAt:Cover){
  const drawDistance=150;
  const positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[];
  for(let j=0;j<4;j++){
    const a=j*2.4,dx=Math.cos(a),dz=Math.sin(a),h=.33+.044*j,start=positions.length/3;
    for(const [side,y,bend] of [[-.075,0,.04],[.075,0,.04],[0,h*1.14,.21]] as const){
      positions.push(bend*dx+side*dz,y,bend*dz-side*dx);
      normals.push(dx*(.12+.28*y),1,dz*(.12+.28*y));
      const tone=.78+.59*y;
      colors.push(tone,tone,tone);
    }
    indices.push(start,start+1,start+2);
  }
  const position=new T.Float32BufferAttribute(positions,3),normal=new T.Float32BufferAttribute(normals,3);
  const color=new T.Float32BufferAttribute(colors,3),index=new T.Uint16BufferAttribute(indices,1);
  const material=new T.MeshLambertMaterial({side:T.DoubleSide,vertexColors:true,fog:false});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{breezeTime,meadowEye:{value:eye}});
    shader.vertexShader=coastalBreeze+meadowPigment+`
      uniform vec3 meadowEye;
      attribute vec4 growth,habitat;
    `+shader.vertexShader.replace('#include <beginnormal_vertex>',`
      vec3 root=growth.xyz;
      float fade=1.-smoothstep(80.,${drawDistance.toFixed(1)},distance(root,meadowEye));
      float gust=breezeAt(root.xz,breezeTime);
      float angle=growth.w*31.;
      mat2 turn=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
      vec2 lean=turn*position.xz;
      vec2 bladeTilt=turn*normal.xz;
      vec3 objectNormal=normalize(habitat.xyz+vec3(bladeTilt.x,0.,bladeTilt.y)
        +vec3(breezeDirection.x,0.,breezeDirection.y)*position.y*gust*.5);
    `).replace('#include <begin_vertex>',`
      vec3 transformed=vec3(lean.x,position.y,lean.y)*(.74+.68*growth.w)*fade;
      transformed.xz+=breezeDirection*transformed.y*transformed.y*(.44+1.8*gust);
      transformed.y*=1.-.29*gust;
      transformed+=root;
      vColor.rgb*=meadowPigment(root.xz,habitat.w,root.y)*(.92+.15*growth.w);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n normal*=faceDirection;');
  };
  const ring=tileRing(28,Math.ceil(drawDistance/28),west,east,(i,j)=>{
    const roots:number[]=[],habitats:number[]=[],box=new T.Box3(),pt=new T.Vector3();
    for(let patchX=0;patchX<7;patchX++)for(let patchZ=0;patchZ<7;patchZ++){
      const cx=i*28+patchX*4+2,cz=j*28+patchZ*4+2;
      const normal=new T.Vector3(height(cx-1,cz)-height(cx+1,cz),2,height(cx,cz-1)-height(cx,cz+1)).normalize();
      const cover=coverAt(cx,cz,height(cx,cz));
      for(let a=0;a<8;a++)for(let b=0;b<8;b++){
        const ix=i*56+patchX*8+a,iz=j*56+patchZ*8+b;
        const x=(ix+random(ix,iz,6))*.5,z=(iz+random(ix,iz,7))*.5;
        if(x<west||x>east||hasTownLawn(x,z))continue;
        const y=height(x,z);
        if(y<.55)continue;
        roots.push(x,y-.045,z,random(ix,iz,8));box.expandByPoint(pt.set(x,y,z));
        habitats.push(normal.x,normal.y,normal.z,cover);
      }
    }
    if(!roots.length)return null;
    const g=new T.InstancedBufferGeometry();
    g.setAttribute('position',position.clone());g.setAttribute('normal',normal.clone());g.setAttribute('color',color.clone());g.setIndex(index.clone());
    g.setAttribute('habitat',new T.InstancedBufferAttribute(new Int8Array(habitats.map(v=>Math.round(v*127))),4,true));
    g.setAttribute('growth',new T.InstancedBufferAttribute(new Float32Array(roots),4));
    g.instanceCount=roots.length/4;g.boundingBox=box.expandByScalar(1.3);g.boundingSphere=box.getBoundingSphere(new T.Sphere());
    const mesh=new T.Mesh(g,material);mesh.name='Corridor meadow';mesh.receiveShadow=true;
    return {mesh,dispose:()=>g.dispose()};
  });
  function view(camera:T.Vector3){
    ring.view(camera);
    for(const tile of ring.group.children){
      const box=(tile as T.Mesh<T.InstancedBufferGeometry>).geometry.boundingBox!;
      tile.visible=box.distanceToPoint(camera)<drawDistance;
    }
  }
  return {...ring,view,dispose(){ring.clear();material.dispose();}};
}
