import { corridorShadow } from './corridor-light.js';
import * as T from 'three';
import { riverGround, shoreline, valleyOrigin } from './valley-river.js';
import { corridorForest, corridorGrass, distantCrowns, treeMeshes, woodlandAt } from './corridor-vegetation.js';
import { woodlandFloor } from './woodland-floor.js';
import type { Gouache } from './gouache.js';
import { boughStart, boughEnd, farCrownStart, farCrownEnd, woodlandEnd } from './tree-dither.js';
import { crownNeighbors, type WoodlandTree } from './woodland-boughs.js';
import { meadowPigment } from './meadow-pigment.js';
import { coastalBreeze } from './coastal-breeze.js';
import { createLowCloud } from './low-cloud.js';
import type { ValleyLighting } from './bay-world.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

const noise=new ImprovedNoise();
const axis=76;
const farEnd=-19900;
const wallHalfWidth=257;
export function overlookHeight(x:number,z:number){
  const river=riverGround(x,z);
  if(z<248||z>820)return river;
  const lateral=(x-112)/208,along=(z-526-(x-70)*.16)/151;
  const hill=161*Math.exp(-.67*lateral*lateral-Math.pow(Math.abs(along),3.4));
  return Math.max(river,-4.2+hill+(2.6*noise.noise(x*.039,z*.028,7)+3.2*Math.sin(x*.041+z*.012))*Math.min(1,hill/40));
}

function corridorFloor(near:number,far:number,extent:number,cityEnd:number){
  const p:number[]=[],uv:number[]=[],cover:number[]=[],idx:number[]=[];
  const xs:number[]=[];
  for(let x=axis-305;x<axis+306;x+=x>12&&x<148?1.25:5)xs.push(x);
  const sliceSet=new Set(depthSlices(extent));
  for(let z=near;z<=far;z+=1.3)sliceSet.add(z);
  for(let z=255;z<776;z+=4)sliceSet.add(z);
  const zs=[...sliceSet].sort((a,b)=>b-a),cols=xs.length;
  for(const [j,z] of zs.entries())for(const [i,x] of xs.entries()){
    const y=overlookHeight(x,z);
    const toe=Math.exp(-Math.abs(wallHalfWidth-Math.abs(x-axis))/18);
    cover.push(woodlandAt(x,z,y,cityEnd));
    p.push(x,y+toe*(9+4*Math.sin(z*.012)),z);uv.push(x*.11,z*.11);
    if(i+1<cols&&j+1<zs.length){const k=j*cols+i;idx.push(k,k+1,k+cols,k+1,k+cols+1,k+cols);}
  }
  const g=new T.BufferGeometry();g.setIndex(idx);g.setAttribute('position',new T.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.setAttribute('woodland',new T.Float32BufferAttribute(cover,1));g.computeVertexNormals();
  const vertices=g.getAttribute('position');
  function bracket(axis:number[],value:number,ascending:boolean){
    let lo=0,hi=axis.length-1;
    while(hi-lo>1){
      const mid=(lo+hi)>>>1;
      if(ascending?axis[mid]!<=value:axis[mid]!>=value)lo=mid;else hi=mid;
    }
    return lo;
  }
  function height(x:number,z:number){
    if(z>zs[0]!||z<zs[zs.length-1]!)return -20;
    const i=bracket(xs,x,true),j=bracket(zs,z,false),k=j*cols+i;
    const u=(x-xs[i]!)/(xs[i+1]!-xs[i]!),v=(z-zs[j]!)/(zs[j+1]!-zs[j]!);
    const b=vertices.getY(k+1),c=vertices.getY(k+cols);
    return u+v<=1 ? (1-u-v)*vertices.getY(k)+u*b+v*c : (u+v-1)*vertices.getY(k+cols+1)+(1-v)*b+(1-u)*c;
  }
  const original=new Float32Array(vertices.count);
  for(let k=0;k<vertices.count;k++)original[k]=vertices.getY(k);
  function gradeTown(grade:(x:number,z:number,y:number)=>number){
    let changed=false;
    for(let j=0;j<zs.length;j++){
      const z=zs[j]!;
      if(z<near||z>far)continue;
      for(let i=0;i<cols;i++){
        const x=xs[i]!,k=j*cols+i;
        const y=Math.fround(grade(valleyOrigin.z-z,x-valleyOrigin.x,original[k]!));
        if(y===vertices.getY(k))continue;
        vertices.setY(k,y);changed=true;
      }
    }
    if(changed){vertices.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();}
  }
  return {geometry:g,height,gradeTown};
}

function wallMaterial(moss:T.Texture,normals:T.Texture,woods:T.Texture,driftTime:{value:number},sunDirection:T.Vector3){
  const material=new T.ShaderMaterial({uniforms:{driftTime,sunDirection:{value:sunDirection},moss:{value:moss},relief:{value:normals},woods:{value:woods}},vertexShader:`
    varying vec3 p;varying vec3 surfaceNormal;
    void main(){p=(modelMatrix*vec4(position,1.)).xyz;surfaceNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D moss,relief,woods;uniform vec3 sunDirection;varying vec3 p,surfaceNormal;${corridorShadow}
      void main(){
        vec3 n=normalize(surfaceNormal);
        vec3 w=pow(abs(n),vec3(8.));w/=dot(w,vec3(1.));
        vec2 uv=p.zy*w.x+p.xy*w.z+p.xz*w.y;
        vec2 drift=.17*vec2(sin(uv.y*.014+sin(uv.x*.021)),cos(uv.x*.019+uv.y*.013));
        vec3 broad=texture2D(moss,uv*vec2(.005,.0028)+drift).rgb;
        vec3 leaves=texture2D(moss,uv*.058+drift*.8+broad.r*.19).rgb;
        float mat=dot(leaves,vec3(.23,.66,.11));
        vec2 slope=texture2D(relief,uv*.058+drift*.8+broad.r*.19).xy*2.-1.;
        float folds=texture2D(moss,uv*vec2(.018,.0021)+drift*.61).g;
        float canopy=smoothstep(.17,.64,broad.g*.49+folds*.30+mat*.46);
        vec2 coverUv=uv*.0153+drift*.39;
        vec3 crown=texture2D(woods,coverUv).rgb;
        float canopyLight=pow(crown.g,1.7);
        vec3 dark=vec3(.004,.018,.014),fern=vec3(.078,.126,.058);
        vec3 color=mix(dark,fern,canopy)*(.30+1.26*canopyLight);
        float seam=smoothstep(.43,.68,folds)*smoothstep(.29,.55,broad.r);
        color=mix(color,vec3(.113,.110,.060)*(.26+mat),seam*.62);
        vec3 tangent=normalize(vec3(n.z,0.,-n.x)+vec3(.0001,0.,0.));
        vec3 bent=normalize(n+tangent*slope.x*.68+vec3(0.,1.,0.)*slope.y*.59);
        float sun=max(dot(bent,sunDirection),0.);
        float lightwell=canopySunlight(p);
        float vertical=.48+.52*smoothstep(35.,560.,p.y);
        color*=vec3(.30,.39,.44)+(sun*.81+.19)*lightwell*vertical*vec3(2.9,2.72,2.14);
        float depth=length(cameraPosition-p);
        float air=1.-exp(-depth*.000087);
        color=mix(color,vec3(.135,.220,.241),air*.91);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});return material;
}

function depthSlices(extent=-farEnd){
  const half=[0];
  let d=0;
  while(d<extent){d=Math.min(extent,d+Math.max(13,d*.030));half.push(d);}
  return half.slice(1).reverse().concat(half.map(v=>-v));
}

function wallGeometry(side:number){
  const zs=depthSlices(),p:number[]=[],idx:number[]=[];
  function strips(rows:number,sample:(z:number,k:number)=>[number,number,number]){
    const offset=p.length/3;
    for(let j=0;j<zs.length;j++)for(let k=0;k<=rows;k++){
      p.push(...sample(zs[j]!,k));
      if(j+1===zs.length||k===rows)continue;
      const a=offset+j*(rows+1)+k,b=a+rows+1;
      if(side===1)idx.push(a,a+1,b,a+1,b+1,b);else idx.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const rim=(z:number)=>2260+84*Math.sin(z*.00043)+41*noise.noise(z*.0012,side,8);
  function edge(z:number,y:number){
    return axis+side*(wallHalfWidth+8.7*noise.noise(z*.0031,y*.0014,side+9)+3.8*noise.noise(z*.014,y*.009,side+5));
  }
  strips(86,(z,k)=>{const y=-20+(rim(z)+20)*k/86;return [edge(z,y),y,z];});
  strips(27,(z,k)=>{
    const top=rim(z),d=(Math.pow(1.215,k)-1)*43,x=edge(z,top)+side*d;
    const rolls=T.MathUtils.smoothstep(d,0,170)*(42*noise.noise(x*.0017,z*.002,16)+20*Math.sin(z*.0012+x*.003));
    return [x,top+rolls,z];
  });
  const g=new T.BufferGeometry();g.setIndex(idx);g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}

export async function createGreenCorridor(heath:T.Texture,trees:T.Group[],lighting:ValleyLighting,paint?:Gouache){
  const root=new T.Group(),owned:T.BufferGeometry[]=[],textures:T.Texture[]=[];
  const loader=new T.TextureLoader();
  const load=(name:string)=>loader.loadAsync('/city/materials/'+name+'.webp').then(t=>{
    t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;textures.push(t);return t;
  }).catch(()=>null);
  const [moss,normal,canopy,sprays]=await Promise.all([
    load('wall-moss'),load('wall-moss-normal'),load('woodland-canopy'),load('moss-leaf-sprays')
  ]);
  const eye=new T.Vector3();
  const driftTime={value:0};
  const walls=wallMaterial(moss??heath,normal??heath,canopy??heath,driftTime,lighting.direction);
  const floor=new T.MeshLambertMaterial({map:heath,fog:false});
  floor.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{driftTime,breezeTime:driftTime,forestEye:{value:eye},floorShade:{value:understory.texture},shadeLayout:{value:understory.layout}});
    shader.vertexShader='attribute float woodland;uniform vec3 forestEye;varying vec3 floorPlace;varying float treeCover,floorDistance;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      floorPlace=position;
      floorDistance=distance(forestEye,position);
      treeCover=woodland;`);
    shader.fragmentShader=corridorShadow+coastalBreeze+meadowPigment+'uniform sampler2D floorShade;uniform vec4 shadeLayout;varying vec3 floorPlace;varying float treeCover,floorDistance;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      #ifdef USE_MAP
        vec2 land=floorPlace.xz;
        float gust=meadowWave(land,breezeTime);
        float fibre=texture2D(map,vMapUv*.93+vec2(gust*.047,0.)).g;
        float seedHeads=texture2D(map,land*vec2(.39,.11)+.04*sin(land.yx*.27)).g;
        float grass=smoothstep(.3,2.,floorPlace.y);
        float resolved=1.-smoothstep(1.,12.,max(fwidth(land.x),fwidth(land.y)));
        vec2 shadeUv=vec2((land.x-shadeLayout.x)/shadeLayout.y,land.y/shadeLayout.z);
        float window=1.-smoothstep(.46,.49,abs(land.y-shadeLayout.w)/shadeLayout.z);
        float shelter=mix(treeCover,texture2D(floorShade,shadeUv).r,window);
        vec3 turf=meadowPigment(land,max(shelter,treeCover),floorPlace.y);
        diffuseColor.rgb=turf*(.76+.93*fibre)*mix(.96,1.09,gust*grass*resolved);
        diffuseColor.rgb*=.96+.20*seedHeads*resolved;
        diffuseColor.rgb*=1.-.53*shelter;
      #endif`)
      .replace('#include <opaque_fragment>','outgoingLight=mix(outgoingLight*mix(vec3(.17,.27,.25),vec3(1.02,.95,.69),canopySunlight(floorPlace)),vec3(.135,.220,.241),(1.-exp(-floorDistance*.000087))*.97);\n#include <opaque_fragment>');
  };
  function add(g:T.BufferGeometry,material:T.Material){owned.push(g);const mesh=new T.Mesh(g,material);root.add(mesh);return mesh;}
  const west=add(wallGeometry(-1),walls),east=add(wallGeometry(1),walls);
  const bounds={west:axis-wallHalfWidth,east:axis+wallHalfWidth};
  let detailNear=valleyOrigin.z-72,detailFar=valleyOrigin.z+72,extent=-farEnd;
  let cityLength=144,surface=corridorFloor(detailNear,detailFar,extent,cityLength);
  const paving=add(surface.geometry,floor);paving.receiveShadow=true;
  function followRiver(start:number,end:number,cityEnd:number){
    const near=valleyOrigin.z-end-16,far=valleyOrigin.z-start+16,length=Math.max(-farEnd,cityEnd+2200);
    if(detailNear===near&&detailFar===far&&extent===length&&cityLength===cityEnd)return;
    detailNear=near;detailFar=far;extent=length;cityLength=cityEnd;
    west.scale.z=east.scale.z=length/-farEnd;
    const old=paving.geometry;
    surface=corridorFloor(near,far,length,cityLength);paving.geometry=surface.geometry;
    grass.clear();forest.clear();distant.clear();understory.clear();owned[owned.indexOf(old)]=paving.geometry;old.dispose();
  }
  const ground=(x:number,z:number)=>surface.height(x,z);
  const coverAt=(x:number,z:number,y:number)=>woodlandAt(x,z,y,cityLength);
  const understory=woodlandFloor(ground,coverAt,bounds.west,bounds.east);
  const grass=corridorGrass(ground,(x,z)=>{
    const depth=valleyOrigin.x+shoreline(valleyOrigin.z-z)-x;
    return z>=detailNear-12&&z<=detailFar+12&&depth>=-6&&depth<=86;
  },bounds.west,bounds.east,driftTime,eye,coverAt);
  root.add(grass.group);
  const forest=corridorForest(trees,ground,coverAt,bounds.west,bounds.east);
  root.add(forest.group);
  const distant=distantCrowns(ground,coverAt,bounds.west,bounds.east,lighting,driftTime,eye,sprays,paint);
  root.add(distant.group);
  function plant(stand:WoodlandTree[],rotation:number){
    const group=new T.Group(),cells=new Map<string,WoodlandTree[]>(),neighbors=crownNeighbors(stand);
    for(const tree of stand){
      const key=Math.floor(tree.x/32)+','+Math.floor(tree.z/32);
      const cell=cells.get(key);
      if(cell)cell.push(tree);else cells.set(key,[tree]);
    }
    for(const cell of cells.values()){
      const near=treeMeshes(cell,trees);
      const middle=distant.boughs.tile(cell,neighbors,0,rotation)!.mesh;
      const far=distant.boughs.tile(cell,neighbors,1,rotation)!.mesh;
      const bounds=middle.geometry.boundingSphere!;
      const center=new T.Vector3(),cameraPosition=new T.Vector3();
      const lod=new T.LOD();
      lod.add(near,middle,far);
      lod.update=camera=>{
        center.copy(bounds.center).applyMatrix4(lod.matrixWorld);
        cameraPosition.setFromMatrixPosition(camera.matrixWorld).sub(center);
        const range=cameraPosition.length(),horizontal=Math.hypot(cameraPosition.x,cameraPosition.z);
        const radius=bounds.radius*lod.matrixWorld.getMaxScaleOnAxis();
        near.visible=range-radius<boughEnd;
        middle.visible=range+radius>boughStart && horizontal-radius<farCrownEnd;
        far.visible=horizontal+radius>farCrownStart && horizontal-radius<woodlandEnd;
      };
      group.add(lod);
    }
    understory.addGarden(group,stand);return group;
  }
  const mist=createLowCloud(lighting);root.add(mist.cloud);
  return {root,bounds,ground,plant,followRiver,gradeTown(grade:(x:number,z:number,y:number)=>number){surface.gradeTown(grade);},get far(){return extent+2300;},tick(t:number,camera:T.Vector3){
    driftTime.value=t;eye.copy(camera);understory.view(eye.z);grass.view(eye);forest.view(eye);distant.view(eye);mist.tick(t,camera.z);
  },dispose(){
    understory.dispose();grass.dispose();forest.clear();distant.dispose();mist.dispose();
    for(const g of owned)g.dispose();for(const tex of textures)tex.dispose();walls.dispose();floor.dispose();
  }};
}
