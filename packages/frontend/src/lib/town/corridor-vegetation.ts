import * as T from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import type { ValleyLighting } from './bay-world.js';
import { treePortraitSpan, type TreeAtlas } from './tree-atlas.js';
import { coastalBreeze } from './coastal-breeze.js';
import { shoreline, valleyOrigin } from './valley-river.js';

const noise=new ImprovedNoise();

export function woodlandAt(x:number,z:number,height:number,cityEnd:number){
  const depth=shoreline(valleyOrigin.z-z)+valleyOrigin.x-x;
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

const groveCell=80/21,nearCells=7,nearRadius=3;

function forestTrees(i:number,j:number,cells:number,height:Surface,coverAt:Cover,west:number,east:number){
  const trees:{x:number;y:number;z:number;seed:number;size:number}[]=[];
  for(let a=0;a<cells;a++)for(let b=0;b<cells;b++){
    const ix=i*cells+a,iz=j*cells+b;
    const x=(ix+random(ix,iz,1))*groveCell,z=(iz+random(ix,iz,2))*groveCell;
    if(x<west||x>east)continue;
    const y=height(x,z),cover=coverAt(x,z,y);
    if(random(ix,iz,3)>=cover*.90)continue;
    trees.push({x,y:y-.15,z,seed:random(ix,iz,4),size:2.8+cover*3.6+random(ix,iz,5)*4.1});
  }
  return trees;
}

export function corridorForest(models:T.Group[],height:Surface,coverAt:Cover,west:number,east:number){
  const dummy=new T.Object3D(),matrix=new T.Matrix4(),woodlandTint=new T.Color();
  for(const model of models)model.updateMatrixWorld(true);
  return tileRing(nearCells*groveCell,nearRadius,west,east,(i,j)=>{
    const trees=forestTrees(i,j,nearCells,height,coverAt,west,east);
    if(!trees.length)return null;
    const group=new T.Group(),parts:T.InstancedMesh[]=[];
    models.forEach((model,species)=>{
      const stand=trees.filter(t=>Math.floor(t.seed*models.length)===species);
      if(!stand.length)return;
      model.traverse(part=>{
        if(!(part instanceof T.Mesh))return;
        const mesh=new T.InstancedMesh(part.geometry,part.material,stand.length);
        mesh.name='Corridor tree branches';mesh.castShadow=true;mesh.receiveShadow=true;
        stand.forEach(({x,y,z,size,seed},k)=>{
          dummy.position.set(x,y,z);dummy.rotation.y=seed*Math.PI*2;
          dummy.scale.setScalar(size);dummy.updateMatrix();
          mesh.setMatrixAt(k,matrix.multiplyMatrices(dummy.matrix,part.matrixWorld));
          woodlandTint.setScalar(.72+.24*seed);mesh.setColorAt(k,woodlandTint);
        });
        mesh.computeBoundingSphere();mesh.boundingSphere!.radius+=1.2;
        group.add(mesh);parts.push(mesh);
      });
    });
    return {mesh:group,dispose:()=>{for(const mesh of parts)mesh.dispose();}};
  });
}

export function distantCrowns(height:Surface,coverAt:Cover,west:number,east:number,atlas:TreeAtlas,lighting:ValleyLighting,
  clock:T.IUniform<number>,eye:T.Vector3,cloudShadow:string){
  function portraitMaterial(distant:boolean){
    return new T.ShaderMaterial({uniforms:{albedo:{value:atlas.albedo.texture},normals:{value:atlas.normals.texture},
      sunDir:{value:lighting.direction},sunColor:{value:lighting.direct},skyColor:{value:lighting.sky},groundColor:{value:lighting.ground},driftTime:clock,forestEye:{value:eye}},vertexShader:`
      uniform vec3 forestEye;uniform float driftTime;attribute vec4 crown;attribute float variety;
      varying vec2 leafUv;varying vec3 trunk;varying float range,foliageLight;varying vec2 yaw;
      void main(){
        trunk=crown.xyz;range=length(forestEye-trunk);
        vec3 sight=cameraPosition-(trunk+vec3(0.,.5*crown.w,0.));
        yaw=vec2(cos(variety*6.2831853),sin(variety*6.2831853));
        float azimuth=atan(sight.x,sight.z)/6.2831853-variety;
        float face=mod(floor(azimuth*4.+.5),4.);
        float elevation=step(.57,normalize(sight).y);
        leafUv=(vec2(face,2.*floor(variety*3.)+elevation)+uv)/vec2(4.,6.);
        foliageLight=(.72+.24*variety)*mix(.62,1.,smoothstep(.24,.83,uv.y));
        float size=crown.w;
        ${distant?`size*=smoothstep(230.,340.,range)*(1.-smoothstep(2050.,2390.,range));`:`
          vec2 tiles=abs(floor(forestEye.xz/${nearCells*groveCell})-floor(trunk.xz/${nearCells*groveCell}));
          size*=step(${nearRadius+.5},max(tiles.x,tiles.y))*(1.-smoothstep(264.,390.,range));`}
        vec4 center=viewMatrix*vec4(trunk+vec3(0.,size*.5,0.),1.);
        center.xy+=position.xy*size*${treePortraitSpan};
        center.x+=size*.018*uv.y*uv.y*sin(dot(trunk.xz,vec2(.058,-.092))-driftTime*.86);
        gl_Position=projectionMatrix*center;
      }`,
      fragmentShader:`
        uniform sampler2D albedo,normals;uniform vec3 sunDir,sunColor,skyColor,groundColor;varying vec2 leafUv;varying vec3 trunk;varying float range,foliageLight;varying vec2 yaw;
        ${cloudShadow}
        void main(){
          vec4 leaf=texture2D(albedo,leafUv);
          if(leaf.a<mix(.27,.08,smoothstep(140.,1100.,range)))discard;
          vec4 encoded=texture2D(normals,leafUv);
          vec3 n=encoded.rgb/max(encoded.a,.001)*2.-1.;
          n=normalize(vec3(dot(n.xz,yaw),n.y,dot(n.xz,vec2(-yaw.y,yaw.x)))+vec3(0.,.0001,0.));
          vec3 skylight=mix(groundColor,skyColor,n.y*.5+.5);
          float shade=(1.-canopySunlight(trunk))*smoothstep(50.,240.,range);
          vec3 light=skylight+sunColor*max(dot(n,sunDir),0.)*(1.-shade);
          vec3 pigment=foliageLight*leaf.rgb/max(leaf.a,.001)*light/3.14159265;
          gl_FragColor=vec4(mix(pigment,vec3(.135,.220,.241),1.-exp(-range*.000087)),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`});
  }
  const middle=portraitMaterial(false),far=portraitMaterial(true);
  function portraits(trees:ReturnType<typeof forestTrees>,material:T.ShaderMaterial){
    if(!trees.length)return null;
    const crowns:number[]=[],variants:number[]=[],box=new T.Box3(),point=new T.Vector3();
    for(const {x,y,z,size,seed} of trees){
      crowns.push(x,y,z,size);variants.push(seed);box.expandByPoint(point.set(x,y,z));
    }
    const g=new T.InstancedBufferGeometry(),quad=new T.PlaneGeometry(1,1);
    g.setAttribute('position',quad.getAttribute('position'));g.setAttribute('uv',quad.getAttribute('uv'));g.setIndex(quad.index);
    g.setAttribute('crown',new T.InstancedBufferAttribute(new Float32Array(crowns),4));
    g.setAttribute('variety',new T.InstancedBufferAttribute(new Float32Array(variants),1));
    g.instanceCount=trees.length;g.boundingSphere=box.expandByScalar(22).getBoundingSphere(new T.Sphere());
    const mesh=new T.Mesh(g,material);mesh.name='Distant treetops';
    return {mesh,dispose:()=>g.dispose()};
  }
  const nearRing=tileRing(80,5,west,east,(i,j)=>portraits(forestTrees(i,j,21,height,coverAt,west,east),middle));
  const farRing=tileRing(240,10,west,east,(i,j)=>{
    const trees:ReturnType<typeof forestTrees>=[];
    for(let a=0;a<30;a++)for(let b=0;b<30;b++){
      const ix=i*30+a,iz=j*30+b;
      const x=(ix+random(ix,iz,13))*8,z=(iz+random(ix,iz,14))*8;
      if(x<west||x>east)continue;
      const y=height(x,z),cover=coverAt(x,z,y);
      if(random(ix,iz,15)>=cover*.95)continue;
      trees.push({x,y,z,size:7.+cover*4.4+random(ix,iz,16)*4.5,seed:random(ix,iz,17)});
    }
    return portraits(trees,far);
  });
  const group=new T.Group();group.add(nearRing.group,farRing.group);
  function clear(){nearRing.clear();farRing.clear();}
  return {group,clear,view(camera:T.Vector3){nearRing.view(camera);farRing.view(camera);},
    dispose(){clear();middle.dispose();far.dispose();}};
}

export function corridorGrass(height:Surface,hasTownLawn:(x:number,z:number)=>boolean,west:number,east:number,
  breezeTime:T.IUniform<number>,eye:T.Vector3){
  const positions:number[]=[],colors:number[]=[],indices:number[]=[];
  for(let j=0;j<7;j++){
    const a=j*2.4,dx=Math.cos(a),dz=Math.sin(a),h=.33+.044*j,start=positions.length/3;
    for(const [side,y,bend] of [[-.042,0,.09],[.042,0,.09],[-.023,h*.56,.14],[.023,h*.56,.14],[0,h,.21]] as const){
      positions.push(bend*dx+side*dz,y,bend*dz-side*dx);
      colors.push(.48+.76*y,.58+.74*y,.36+.74*y);
    }
    indices.push(start,start+1,start+2,start+1,start+3,start+2,start+2,start+3,start+4);
  }
  const position=new T.Float32BufferAttribute(positions,3),color=new T.Float32BufferAttribute(colors,3),index=new T.Uint16BufferAttribute(indices,1);
  const material=new T.ShaderMaterial({side:T.DoubleSide,vertexColors:true,uniforms:{breezeTime,meadowEye:{value:eye}},
    vertexShader:coastalBreeze+`
      uniform vec3 meadowEye;
      attribute vec4 growth;
      varying vec3 pigment;
      void main(){
        vec3 root=growth.xyz;
        float fade=1.-smoothstep(40.,75.,distance(root,meadowEye));
        float gust=breezeAt(root.xz,breezeTime);
        float angle=growth.w*31.;
        vec3 p=position*(.74+.68*growth.w)*fade;
        p.xz=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xz;
        p.xz+=breezeDirection*p.y*p.y*(.44+1.8*gust);
        p.y*=1.-.29*gust;
        pigment=color*mix(vec3(.084,.153,.046),vec3(.235,.319,.100),.29*growth.w+.71*gust);
        gl_Position=projectionMatrix*viewMatrix*vec4(root+p,1.);
      }`,
    fragmentShader:`varying vec3 pigment;void main(){gl_FragColor=vec4(pigment,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const ring=tileRing(28,3,west,east,(i,j)=>{
    const roots:number[]=[],box=new T.Box3(),pt=new T.Vector3();
    for(let a=0;a<56;a++)for(let b=0;b<56;b++){
      const ix=i*56+a,iz=j*56+b;
      const x=(ix+random(ix,iz,6))*.5,z=(iz+random(ix,iz,7))*.5;
      if(x<west||x>east||hasTownLawn(x,z))continue;
      const y=height(x,z);
      if(y<.55)continue;
      roots.push(x,y-.045,z,random(ix,iz,8));box.expandByPoint(pt.set(x,y,z));
    }
    if(!roots.length)return null;
    const g=new T.InstancedBufferGeometry();
    g.setAttribute('position',position.clone());g.setAttribute('color',color.clone());g.setIndex(index.clone());
    g.setAttribute('growth',new T.InstancedBufferAttribute(new Float32Array(roots),4));
    g.instanceCount=roots.length/4;g.boundingBox=box.expandByScalar(1.3);g.boundingSphere=box.getBoundingSphere(new T.Sphere());
    const mesh=new T.Mesh(g,material);mesh.name='Corridor meadow';
    return {mesh,dispose:()=>g.dispose()};
  });
  function view(camera:T.Vector3){
    ring.view(camera);
    for(const tile of ring.group.children){
      const box=(tile as T.Mesh<T.InstancedBufferGeometry>).geometry.boundingBox!;
      tile.visible=box.distanceToPoint(camera)<75;
    }
  }
  return {...ring,view,dispose(){ring.clear();material.dispose();}};
}
