import * as T from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { corridorShadow } from './corridor-light.js';
import type { ValleyLighting } from './bay-world.js';
import { coastalTreeGeometry } from './coastal-flora.js';
import { canopySway, treeFlex } from './coastal-breeze.js';
import { leafBrushCoordinates, leafBrushPigment, type Gouache } from './gouache.js';
import { boughStart, boughEnd, farCrownStart, farCrownEnd, woodlandEnd, treeDither } from './tree-dither.js';

export type WoodlandTree={ix:number;iz:number;x:number;y:number;z:number;size:number;species:number;yaw:number;spread:number};

export function crownNeighbors(trees:WoodlandTree[]){
  const cells=new Map<number,WoodlandTree[]>();
  for(const tree of trees){
    const key=tree.ix*65536+tree.iz;
    const cell=cells.get(key);
    if(cell)cell.push(tree);else cells.set(key,[tree]);
  }
  return cells;
}

function distantGeometry(level:number){
  const shapes=[0,1,2].map(species=>coastalTreeGeometry(species,level).toNonIndexed());
  const count=Math.max(...shapes.map(shape=>shape.getAttribute('position').count));
  const geometry=new T.BufferGeometry();
  for(const [species,shape] of shapes.entries()){
    const attributes=['position','normal','color'];
    if(level===1 && species===0)attributes.push('sprayUv');
    for(const attribute of attributes){
      const source=shape.getAttribute(attribute);
      const tint=attribute==='color';
      const size=tint?4:source.itemSize,array=new Float32Array(count*size);
      if(tint){
        const mask=shape.getAttribute('leafMask');
        for(let i=0;i<source.count;i++){
          array.set([source.getX(i),source.getY(i),source.getZ(i),mask.getX(i)],i*4);
        }
      }else array.set(source.array);
      const name=tint?'tint':attribute;
      geometry.setAttribute(species===0?name:name+species,new T.BufferAttribute(array,size));
    }
    shape.dispose();
  }
  return mergeVertices(geometry);
}

export function woodlandBoughs(lighting:ValleyLighting,clock:T.IUniform<number>,eye:T.Vector3,sprays:T.Texture|null,paint?:Gouache){
  const geometry=[distantGeometry(sprays?1:2),distantGeometry(2)];
  const materials=geometry.map((_,level)=>{
    const leafy=level===0 && !!sprays;
    return new T.ShaderMaterial({
      side:leafy?T.DoubleSide:T.FrontSide,
      clipping:true,uniforms:{sunDir:{value:lighting.direction},sunColor:{value:lighting.direct},
        skyColor:{value:lighting.sky},groundColor:{value:lighting.ground},seconds:clock,driftTime:clock,forestEye:{value:eye},sprays:{value:sprays},
        ...(paint?{gouacheMap:{value:paint.strokes},gouacheCoverage:paint.coverage}:{})},
      vertexShader:`
        #include <clipping_planes_pars_vertex>
        uniform vec3 forestEye,sunDir,sunColor,skyColor,groundColor;
        uniform float seconds;
        ${canopySway}
        attribute vec3 position1,normal1,position2,normal2;
        attribute vec4 tint,tint1,tint2;
        ${paint?'varying vec3 leafBrush;'+leafBrushCoordinates:''}
        attribute vec4 crown,northCrown,southCrown,planting;
        varying vec2 treeCoverage;
        ${leafy?'attribute vec2 sprayUv; varying vec2 leafUv;':''}
        varying vec3 trunk,ambient,direct;
        varying float range,shade;
        float intercepted(vec4 neighbor,vec3 local){
          vec3 delta=mat3(modelMatrix)*neighbor.xyz-local;
          float along=dot(delta,sunDir);
          float lateral=length(delta-sunDir*max(0.,along));
          return smoothstep(0.,1.5,along+neighbor.w*.25)*(1.-smoothstep(neighbor.w*.44,neighbor.w+.001,lateral));
        }
        void main(){
          trunk=(modelMatrix*vec4(crown.xyz,1.)).xyz;
          range=distance(forestEye,trunk);
          float horizontal=distance(forestEye.xz,trunk.xz);
          float coarse=smoothstep(${farCrownStart}.,${farCrownEnd}.,horizontal);
          ${level===0?`
            float bough=smoothstep(${boughStart}.,${boughEnd}.,distance(cameraPosition,trunk));
            treeCoverage=vec2(coarse,bough);`:`
            treeCoverage=vec2(0.,coarse*(1.-smoothstep(2050.,${woodlandEnd}.,range)));`}
          if(treeCoverage.y<=treeCoverage.x){gl_Position=vec4(2.,2.,2.,1.);return;}
          vec3 p=position,n=normal;
          vec4 pigment=tint;
          if(planting.x>1.5){p=position2;n=normal2;pigment=tint2;}
          else if(planting.x>.5){p=position1;n=normal1;pigment=tint1;}
          ${leafy?`leafUv=sprayUv;
          if(pigment.a>.5){
            leafUv.y-=planting.x*.3125;
            n=normalize(vec3(p.x,.10+.75*(p.y-.43),p.z));
          }`:''}
          mat2 turn=mat2(planting.y,-planting.z,planting.z,planting.y);
          vec3 local=p*crown.w;
          local.xz=turn*local.xz*planting.w;
          local=mat3(modelMatrix)*local;
          ${paint?'leafBrush=leafBrushCoordinates(trunk+local,pigment.a);':''}
          local.xz+=${treeFlex}*length(modelMatrix[1].xyz)*crown.w*canopySway(trunk.xz,local.xz,p.y,seconds);
          n.xz=turn*n.xz/planting.w;
          n=normalize(mat3(modelMatrix)*n);
          ambient=pigment.rgb*mix(groundColor,skyColor,.5+.5*n.y)/3.14159265;
          direct=pigment.rgb*sunColor*max(0.,dot(n,sunDir))/3.14159265;
          shade=max(intercepted(northCrown,local),intercepted(southCrown,local));
          vec4 mvPosition=viewMatrix*vec4(trunk+local,1.);
          gl_Position=projectionMatrix*mvPosition;
          #include <clipping_planes_vertex>
        }`,
      fragmentShader:`
        #include <clipping_planes_pars_fragment>
        ${leafy?'uniform sampler2D sprays; varying vec2 leafUv;':''}
        ${paint?'varying vec3 leafBrush;'+leafBrushPigment:''}
        varying vec2 treeCoverage;
        varying vec3 trunk,ambient,direct;
        varying float range,shade;
        ${treeDither}
        ${corridorShadow}
        void main(){
          #include <clipping_planes_fragment>
          clipTreeCoverage(treeCoverage);
          ${leafy?`vec4 spray=texture2D(sprays,leafUv);
          bool foliage=leafUv.y>0.;
          if(foliage && spray.a<mix(.30,.14,smoothstep(140.,500.,range)))discard;`:''}
          float shadow=max(shade,(1.-canopySunlight(trunk))*smoothstep(50.,240.,range));
          vec3 color=ambient*(1.-.25*shadow)+direct*(1.-.88*shadow);
          ${leafy?'if(foliage)color*=clamp(spray.r/(.70*max(spray.a,.12)),.55,1.40);':''}
          ${paint?'color*=leafBrushPigment(leafBrush);':''}
          gl_FragColor=vec4(mix(color,vec3(.135,.220,.241),1.-exp(-range*.000087)),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
  });
  function tile(trees:WoodlandTree[],neighbors:Map<number,WoodlandTree[]>,level:number,rotation=0){
    if(!trees.length)return null;
    const position:number[]=[],planting:number[]=[],north:number[]=[],south:number[]=[];
    const box=new T.Box3(),point=new T.Vector3();
    const cos=Math.cos(rotation),sin=Math.sin(rotation);
    for(const t of trees){
      position.push(t.x,t.y,t.z,t.size);planting.push(t.species,Math.cos(t.yaw),Math.sin(t.yaw),t.spread);box.expandByPoint(point.set(t.x,t.y,t.z));
      for(const [sign,output] of [[-1,north],[1,south]] as const){
        let best:WoodlandTree|undefined,score=-Infinity;
        for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
          const cell=neighbors.get((t.ix+dx)*65536+t.iz+dz);
          if(!cell)continue;
          for(const other of cell){
            if(other===t)continue;
            const lx=other.x-t.x,lz=other.z-t.z;
            const x=cos*lx+sin*lz,z=cos*lz-sin*lx,r=other.size*.36;
            if(sign*z<-.1)continue;
            const y=other.y+.66*other.size-(t.y+.55*t.size);
            const along=-.21*x+sign*.50*z+.84*y;
            const miss=Math.hypot(x+.21*along,z-sign*.50*along,y-.84*along);
            const weight=r-miss+.12*y;
            if(weight>score){score=weight;best=other;}
          }
        }
        if(best)output.push(best.x-t.x,best.y-t.y+.66*best.size,best.z-t.z,best.size*.36);
        else output.push(0,-100,0,0);
      }
    }
    const source=geometry[level]!,g=new T.InstancedBufferGeometry();
    g.setIndex(source.index!.clone());
    for(const [name,attribute] of Object.entries(source.attributes))g.setAttribute(name,attribute.clone());
    for(const [name,array,size] of [['crown',position,4],['northCrown',north,4],['southCrown',south,4],['planting',planting,4]] as const)
      g.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(array),size));
    g.instanceCount=trees.length;g.boundingBox=box.expandByScalar(14);g.boundingSphere=box.getBoundingSphere(new T.Sphere());
    const mesh=new T.Mesh(g,materials[level]);mesh.name='Woodland boughs';
    return {mesh,dispose:()=>g.dispose()};
  }
  return {tile,dispose(){for(const g of geometry)g.dispose();for(const m of materials)m.dispose();}};
}
