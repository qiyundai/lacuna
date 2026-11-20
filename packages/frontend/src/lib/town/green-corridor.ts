import * as T from 'three';
import { riverGround, buildingBelt, valleyOrigin } from './valley-river.js';
import { createLowCloud } from './low-cloud.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {crownBounds} from './coastal-flora.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

const noise=new ImprovedNoise();
const axis=76;
const farEnd=-19900;
const wallHalfWidth=257;
const corridorShadow=`
  uniform float driftTime;
  float canopySunlight(vec3 p){
    float k=p.z+.115*p.y+.11*(p.x-76.)+driftTime*1.7;
    float folded=sign(k)*log(1.+abs(k)*.000115)/.000115;
    float phase=folded*.012+.78*sin(folded*.0041)+.28*sin(folded*.0023+p.x*.002);
    phase+=.09*sin(p.y*.017+folded*.009)+.07*sin(p.y*.034+p.x*.012);
    float cloud=sin(phase)+.18*sin(phase*1.81+.7)+.08*sin(folded*.027+p.x*.008);
    float softness=.34+min(.45,fwidth(cloud));
    return smoothstep(-.04-softness,.04+softness,cloud);
  }`;

export function overlookHeight(x:number,z:number){
  const river=riverGround(x,z);
  if(z<248||z>820)return river;
  const lateral=(x-112)/208,along=(z-526-(x-70)*.16)/151;
  const hill=161*Math.exp(-.67*lateral*lateral-Math.pow(Math.abs(along),3.4));
  return Math.max(river,-4.2+hill+(2.6*noise.noise(x*.039,z*.028,7)+3.2*Math.sin(x*.041+z*.012))*Math.min(1,hill/40));
}

function corridorFloor(near:number,far:number,extent:number){
  const p:number[]=[],c:number[]=[],uv:number[]=[],idx:number[]=[];
  const xs:number[]=[];
  for(let x=axis-305;x<axis+306;x+=x>12&&x<148?1.25:5)xs.push(x);
  const sliceSet=new Set(depthSlices(extent));
  for(let z=near;z<=far;z+=1.3)sliceSet.add(z);
  for(let z=255;z<776;z+=4)sliceSet.add(z);
  const zs=[...sliceSet].sort((a,b)=>b-a),cols=xs.length;
  const tint=new T.Color(),field=new T.Color('#8f9b63'),forest=new T.Color('#465b3f'),straw=new T.Color('#a3a161');
  for(const [j,z] of zs.entries())for(const [i,x] of xs.entries()){
    const y=overlookHeight(x,z);
    const toe=Math.exp(-Math.abs(wallHalfWidth-Math.abs(x-axis))/18);
    p.push(x,y+toe*(9+4*Math.sin(z*.012)),z);uv.push(x*.11,z*.11);
    const grain=.48+.47*noise.noise(x*.030,z*.028,12)+.1*Math.cos(x*.067+z*.037);
    tint.copy(forest).lerp(field,T.MathUtils.clamp(grain,0,1)).lerp(straw,T.MathUtils.smoothstep(y,56,144)*.75);
    c.push(tint.r,tint.g,tint.b);
    if(i+1<cols&&j+1<zs.length){const k=j*cols+i;idx.push(k,k+1,k+cols,k+1,k+cols+1,k+cols);}
  }
  const g=new T.BufferGeometry();g.setIndex(idx);g.setAttribute('position',new T.Float32BufferAttribute(p,3));
  g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}

function wallMaterial(moss:T.Texture,normals:T.Texture,woods:T.Texture,driftTime:{value:number}){
  const material=new T.ShaderMaterial({uniforms:{driftTime,moss:{value:moss},relief:{value:normals},woods:{value:woods}},vertexShader:`
    varying vec3 p;varying vec3 surfaceNormal;
    void main(){p=(modelMatrix*vec4(position,1.)).xyz;surfaceNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D moss,relief,woods;varying vec3 p,surfaceNormal;${corridorShadow}
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
        float sun=max(dot(bent,normalize(vec3(-.87,.38,.21))),0.);
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

async function shoreCrowns(canopy:T.Texture){
  const source=await new GLTFLoader().loadAsync('/town/land/tree_detailed_fall.glb').catch(()=>undefined);
  if(!source)return;
  const bounds=new T.Box3().setFromObject(source.scene);
  const height=bounds.max.y-bounds.min.y,parts:T.BufferGeometry[]=[];
  source.scene.traverse(node=>{
    if(!(node instanceof T.Mesh))return;
    const label=node.material.name;
    if(/leaf|wood/i.test(label)){
      const leaf=/leaf/i.test(label);
      const elements=leaf?crownBounds(node.geometry).map((box,i)=>{
        const size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
        const clump=new T.IcosahedronGeometry(1,1),pos=clump.getAttribute('position');
        for(let j=0;j<pos.count;j++){
          const x=pos.getX(j),y=pos.getY(j),z=pos.getZ(j),r=1+.17*noise.noise(3*x+i,3*y,3*z);
          pos.setXYZ(j,x*r,y*r,z*r);
        }
        clump.scale(size.x*.65,size.y*.62,size.z*.64);clump.translate(center.x,center.y,center.z);return clump;
      }):[node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone()];
      for(const part of elements){
        part.applyMatrix4(node.matrixWorld);part.translate(0,-bounds.min.y,0);part.scale(1/height,1/height,1/height);
        for(const name of Object.keys(part.attributes))if(name!=='position'&&name!=='normal')part.deleteAttribute(name);
        const pos=part.getAttribute('position'),colors:number[]=[];
        for(let i=0;i<pos.count;i++){
          const sun=.55+.39*pos.getY(i)+.12*pos.getX(i);
          if(leaf)colors.push(sun*.85,sun,sun*.78);
          else colors.push(.33,.245,.16);
        }
        part.setAttribute('color',new T.Float32BufferAttribute(colors,3));parts.push(part);
      }
    }
    node.geometry.dispose();node.material.dispose();
  });
  const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();
  const material=new T.MeshLambertMaterial({vertexColors:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.leaves={value:canopy};
    shader.vertexShader='varying vec3 crownPoint;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n crownPoint=(instanceMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader='uniform sampler2D leaves;varying vec3 crownPoint;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb*=.65+.95*texture2D(leaves,crownPoint.xz*.18+crownPoint.y*.07).g;');
  };
  const mesh=new T.InstancedMesh(geometry,material,14000);
  const dummy=new T.Object3D(),tint=new T.Color();
  const rand=(i:number)=>T.MathUtils.euclideanModulo(Math.sin(i*17.13+.22)*43752.15,1);
  let written=0;
  for(let i=0;i<8900&&written<mesh.count;i++){
    const x=axis+(rand(i*4)-.5)*535,z=-475+rand(i*4+1)*850;
    const y=overlookHeight(x,z),group=noise.noise(x*.022,z*.019,8);
    if(buildingBelt(x,z)||y<1.5||z>348+23*group||group+.28*Math.sin(x*.025+z*.027)<-.13)continue;
    const r=4.1+5.2*rand(i*4+2);
    dummy.position.set(x,y-.10,z);dummy.rotation.y=i*2.4;
    dummy.scale.set(r*1.13,r*(.91+rand(i+9)*.39),r);dummy.updateMatrix();
    mesh.setMatrixAt(written,dummy.matrix);
    tint.setHSL(.22+.07*rand(i),.23+.12*rand(i+11),.21+.105*rand(i+54),T.SRGBColorSpace);
    mesh.setColorAt(written++,tint);
  }
  mesh.count=written;mesh.computeBoundingSphere();return mesh;
}

function ridgeGrass(){
  const g=new T.InstancedBufferGeometry(),positions:number[]=[],colors:number[]=[],indices:number[]=[];
  for(let j=0;j<5;j++){
    const a=j*2.4,dx=Math.cos(a),dz=Math.sin(a),h=.25+.035*j;
    const n=positions.length/3;
    for(const [offset,y,bend] of [[-.028,0,.06],[.028,0,.06],[-.014,h*.6,.10],[.014,h*.6,.10],[0,h,.15]] as const){
      positions.push(bend*dx+offset*dz,y,bend*dz-offset*dx);
      colors.push(.64+y,.73+y*.51,.42+y*.79);
    }
    indices.push(n,n+1,n+2,n+1,n+3,n+2,n+2,n+3,n+4);
  }
  const origins:number[]=[],variation:number[]=[];
  const rand=(i:number)=>T.MathUtils.euclideanModulo(Math.sin(i*12.9898+4.1)*43758.5453,1);
  for(let i=0;i<33000;i++){
    const x=66+(rand(i*4)-.5)*126,z=399+rand(i*4+1)*106;
    origins.push(x,overlookHeight(x,z)-.085,z);
    variation.push(rand(i*4+2)*6.28,.69+rand(i*4+3)*1.22);
  }
  g.setIndex(indices);g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.setAttribute('origin',new T.InstancedBufferAttribute(new Float32Array(origins),3));
  g.setAttribute('growth',new T.InstancedBufferAttribute(new Float32Array(variation),2));g.instanceCount=variation.length/2;
  g.boundingSphere=new T.Sphere(new T.Vector3(66,135,450),111);
  const clock={value:0};
  const material=new T.ShaderMaterial({side:T.DoubleSide,uniforms:{clock},vertexColors:true,vertexShader:`
    attribute vec3 origin;attribute vec2 growth;uniform float clock;varying vec3 pigment;
    void main(){
      vec3 p=position*growth.y;
      p.xz=mat2(cos(growth.x),-sin(growth.x),sin(growth.x),cos(growth.x))*p.xz;
      float gust=sin(origin.x*.19+origin.z*.09-clock*1.5+.75*sin(origin.z*.15));
      p.x+=p.y*p.y*(.64+.5*gust);
      float band=.5+.5*sin(origin.x*.046+origin.z*.12+.9*sin(origin.x*.053));
      pigment=color*mix(vec3(.038,.067,.026),vec3(.21,.216,.073),band*.57+.23+.13*gust);
      gl_Position=projectionMatrix*viewMatrix*vec4(origin+p,1.);
    }`,fragmentShader:`varying vec3 pigment;void main(){gl_FragColor=vec4(pigment,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  return {mesh:new T.Mesh(g,material),clock,dispose(){g.dispose();material.dispose();}};
}

export async function createGreenCorridor(heath:T.Texture){
  const root=new T.Group(),owned:T.BufferGeometry[]=[],textures:T.Texture[]=[];
  const loader=new T.TextureLoader();
  const load=(name:string)=>loader.loadAsync('/city/materials/'+name+'.webp').then(t=>{
    t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;textures.push(t);return t;
  }).catch(()=>heath);
  const [moss,normal,canopy]=await Promise.all([load('wall-moss'),load('wall-moss-normal'),load('woodland-canopy')]);
  const grass=ridgeGrass();root.add(grass.mesh);
  const driftTime={value:0},walls=wallMaterial(moss,normal,canopy,driftTime);
  const floor=new T.MeshLambertMaterial({map:heath,vertexColors:true,fog:false});
  floor.onBeforeCompile=shader=>{
    shader.uniforms.driftTime=driftTime;
    shader.vertexShader='varying vec3 floorPlace;varying float floorDistance;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n floorPlace=(modelMatrix*vec4(position,1.)).xyz;floorDistance=length(mvPosition.xyz);');
    shader.fragmentShader=corridorShadow+'\nvarying vec3 floorPlace;varying float floorDistance;\n'+shader.fragmentShader.replace('#include <map_fragment>',
      '#ifdef USE_MAP\n diffuseColor.rgb*=.73+2.25*texture2D(map,vMapUv).g;\n#endif')
      .replace('#include <opaque_fragment>','outgoingLight=mix(outgoingLight*mix(vec3(.17,.27,.25),vec3(1.02,.95,.69),canopySunlight(floorPlace)),vec3(.135,.220,.241),(1.-exp(-floorDistance*.000087))*.97);\n#include <opaque_fragment>');
  };
  function add(g:T.BufferGeometry,material:T.Material){owned.push(g);const mesh=new T.Mesh(g,material);root.add(mesh);return mesh;}
  const west=add(wallGeometry(-1),walls),east=add(wallGeometry(1),walls);
  const bounds={west:axis-wallHalfWidth,east:axis+wallHalfWidth};
  let detailNear=valleyOrigin.z-72,detailFar=valleyOrigin.z+72,extent=-farEnd;
  const paving=add(corridorFloor(detailNear,detailFar,extent),floor);paving.receiveShadow=true;
  function followRiver(start:number,end:number,cityEnd:number){
    const near=valleyOrigin.z-end-16,far=valleyOrigin.z-start+16,length=Math.max(-farEnd,cityEnd+2200);
    if(detailNear===near&&detailFar===far&&extent===length)return;
    detailNear=near;detailFar=far;extent=length;
    west.scale.z=east.scale.z=length/-farEnd;
    const old=paving.geometry;
    paving.geometry=corridorFloor(near,far,length);owned[owned.indexOf(old)]=paving.geometry;old.dispose();
  }
  function lightTerrain(material:T.MeshLambertMaterial|T.MeshStandardMaterial){
    const compile=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey();
    material.customProgramCacheKey=()=>key+'-corridor';
    material.fog=false;
    material.onBeforeCompile=(shader,renderer)=>{
      compile(shader,renderer);shader.uniforms.driftTime=driftTime;
      shader.vertexShader='varying vec3 canyonPlace;\n'+shader.vertexShader.replace('#include <project_vertex>',`
        #include <project_vertex>
        vec4 canyonLocal=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          canyonLocal=instanceMatrix*canyonLocal;
        #endif
        canyonPlace=(modelMatrix*canyonLocal).xyz;`);
      shader.fragmentShader=corridorShadow+'\nvarying vec3 canyonPlace;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`
        outgoingLight*=mix(vec3(.21,.32,.31),vec3(1.02,.96,.82),canopySunlight(canyonPlace));
        outgoingLight=mix(outgoingLight,vec3(.135,.220,.241),(1.-exp(-length(cameraPosition-canyonPlace)*.000087))*.91);
        #include <opaque_fragment>`);
    };
  }
  const woods=await shoreCrowns(canopy);if(woods){lightTerrain(woods.material);root.add(woods);}
  const mist=createLowCloud();root.add(mist.cloud);
  return {root,bounds,followRiver,lightTerrain,get far(){return extent+2300;},tick(t:number){driftTime.value=t;grass.clock.value=t;mist.tick(t);},dispose(){
    grass.dispose();if(woods){woods.dispose();woods.geometry.dispose();woods.material.dispose();}mist.dispose();
    for(const g of owned)g.dispose();for(const tex of textures)tex.dispose();walls.dispose();floor.dispose();
  }};
}
