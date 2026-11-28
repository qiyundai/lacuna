import * as T from 'three';
import { meadowPigment } from './meadow-pigment.js';
import { coastalBreeze } from './coastal-breeze.js';

function hash(x:number,z:number) {
  let h=Math.imul(x,374761393)+Math.imul(z,668265263);
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967296;
}

function noise(x:number,z:number) {
  const i=Math.floor(x),j=Math.floor(z);
  const u=T.MathUtils.smoothstep(x-i,0,1),v=T.MathUtils.smoothstep(z-j,0,1);
  return T.MathUtils.lerp(T.MathUtils.lerp(hash(i,j),hash(i+1,j),u),T.MathUtils.lerp(hash(i,j+1),hash(i+1,j+1),u),v);
}

export function groveDensity(x:number,z:number) {
  const bend=noise(x*.075,z*.075)*6;
  return T.MathUtils.smoothstep(.7*noise((x+bend)*.075,z*.081)+.3*noise(x*.185,z*.19),.28,.75);
}

export function plantGroves(left:number,right:number,shore:(x:number)=>number,height:(x:number,z:number)=>number,tree:(x:number,y:number,z:number,h:number,seed:number)=>void) {
  for(let i=Math.floor((left-14)/4);i<=Math.ceil((right+14)/4);i++) {
    for(let j=0;j<7;j++){
      const x=(i+.1+.8*hash(i,j))*4,z=shore(x)-32-(j+hash(i,j+91))*3.8;
      const density=groveDensity(x,z);
      if(hash(i+61,j)>.035+.70*density*density || height(x,z)<2)continue;
      const count=1+Math.floor(density*(1.4+2.8*hash(i+71,j)));
      const family=Math.floor(3*hash(Math.floor(x/11),Math.floor(z/13)));
      for(let k=0;k<count;k++){
        const key=j*17+k,angle=hash(i,key+230)*Math.PI*2;
        const r=k===0?0:1.1+1.5*hash(i+19,key);
        const tx=x+r*Math.cos(angle),tz=z+r*Math.sin(angle),y=height(tx,tz);
        if(y<1.3)continue;
        const seed=3*Math.floor(hash(i+37,key)*8000)+(hash(i,key+503)<.8?family:(family+1)%3);
        const stature=k===0?2.65+1.95*density:.95+2.4*hash(i+73,key);
        tree(tx,y,tz,stature,seed);
      }
    }
  }
}

function blades(count:number,seed:number) {
  const position:number[]=[],normals:number[]=[],roots:number[]=[],colors:number[]=[],sections:number[]=[],indices:number[]=[];
  for(let i=0;i<count;i++){
    const u=hash(i+seed,2),v=hash(i+seed,3),width=.027+.022*hash(i+seed,4);
    const angle=hash(i+seed,5)*Math.PI*2, dx=Math.cos(angle)*width,dz=Math.sin(angle)*width;
    const h=.24+.31*hash(i+seed,6),bend=.04+.12*hash(i+seed,7),shade=.77+.31*hash(i+seed,8);
    const bx=-Math.sin(angle)*bend,bz=Math.cos(angle)*bend;
    for(const t of [0,.53,1]){
      const taper=1.-t,tone=.55+.64*t;
      for(const side of (t===1?[0]:[-1,1])){
        position.push(bx*t*t+side*dx*taper,t===0?-.028:h*t,bz*t*t+side*dz*taper);
        roots.push(u,v);sections.push(t);
        normals.push(-Math.sin(angle)*.27,1,Math.cos(angle)*.27);
        colors.push(tone*shade,tone*shade,tone);
      }
    }
    const a=5*i;
    indices.push(a,a+1,a+2,a+2,a+1,a+3,a+2,a+3,a+4);
  }
  return {position:new T.Float32BufferAttribute(position,3),normal:new T.Float32BufferAttribute(normals,3),uv:new T.Float32BufferAttribute(roots,2),color:new T.Float32BufferAttribute(colors,3),bladeSection:new T.Float32BufferAttribute(sections,1),index:new T.Uint16BufferAttribute(indices,1)};
}

export function createMeadow(ground:T.BufferGeometry,rows:number,eye:T.Vector3,heath:T.Texture,breezeTime:T.IUniform<number>={value:0},snowCover:T.IUniform<number>={value:0}) {
  const pos=ground.getAttribute('position'),normal=ground.getAttribute('normal'),habitat=ground.getAttribute('habitat');
  ground.computeBoundingBox();
  const bounds=ground.boundingBox!, min=bounds.min, step=.32;
  const width=Math.ceil((bounds.max.x-min.x)/step)+1,depth=Math.ceil((bounds.max.z-min.z)/step)+1;
  const pathData=new Uint8Array(width*depth);
  const paths=new T.DataTexture(pathData,width,depth,T.RedFormat);
  paths.magFilter=paths.minFilter=T.LinearFilter;paths.needsUpdate=true;
  const group=new T.Group();
  const sectors:{mesh:T.Mesh;box:T.Box3;range:number}[]=[];
  const layers=[{pattern:blades(7,275),end:136,start:78},{pattern:blades(18,93),end:29,start:16}].map(layer=>{
    const material=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
    material.customProgramCacheKey=()=>'coastal-lawn';
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{lawnEye:{value:eye},bladeRange:{value:new T.Vector2(layer.start,layer.end)},pavingMask:{value:paths},maskBounds:{value:new T.Vector4(min.x,min.z,width*step,depth*step)},lawnTexture:{value:heath}});
      shader.uniforms.breezeTime=breezeTime;shader.uniforms.snowCover=snowCover;
      shader.vertexShader=coastalBreeze+meadowPigment+`
        attribute vec3 corner, edgeB, edgeC, turfCover, treeCover;
        attribute vec4 scatter;
        attribute float bladeSection;
        uniform float snowCover;uniform vec3 lawnEye; uniform vec2 bladeRange; uniform vec4 maskBounds;
        uniform sampler2D pavingMask;
        varying vec2 bladeUv;
      `+shader.vertexShader.replace('#include <beginnormal_vertex>',`
        vec2 samplePoint=fract(uv+scatter.xy);
        float u=sqrt(samplePoint.x);
        vec3 bary=vec3(1.-u,u*(1.-samplePoint.y),u*samplePoint.y);
        vec3 root=corner+edgeB*bary.y+edgeC*bary.z;
        bladeUv=root.xz*.43;
        float stand=dot(treeCover,bary);
        vec3 worldRoot=(modelMatrix*vec4(root,1.)).xyz;
        float gust=breezeAt(worldRoot.xz,breezeTime)*(1.-.32*stand);
        float angle=max(.001,(.23+1.91*gust)*bladeSection);
        float curl=sin(angle);
        vec3 groundNormal=normalize(cross(edgeB,edgeC));
        vec3 objectNormal=normalize(groundNormal+normal*.65+vec3(breezeDirection.x,-.22,breezeDirection.y)*curl*.61);
      `).replace('#include <begin_vertex>',`
        float meadow=dot(turfCover,bary);
        float path=texture2D(pavingMask,(root.xz-maskBounds.xy)/maskBounds.zw).r;
        float lod=1.-smoothstep(bladeRange.x,bladeRange.y,distance(root,lawnEye));
        float growth=smoothstep(.13,.76,meadow)*(1.-smoothstep(.08,.70,path))*lod;
        float fold=sin(root.x*.18-root.z*.24);
        float drift=.5+.27*sin(root.x*.38+root.z*.24+1.65*fold)+.23*cos(root.z*.40-root.x*.19+fold);
        float lengthScale=(.85+.54*drift-.22*stand)*growth*mix(1.,.14,snowCover);
        vec2 lean=mat2(scatter.z,scatter.w,-scatter.w,scatter.z)*position.xz;
        float up=max(position.y,0.);
        vec2 localWind=(vec3(breezeDirection.x,0.,breezeDirection.y)*mat3(modelMatrix)).xz;
        vec2 wind=normalize(localWind+vec2(-localWind.y,localWind.x)*fold*.22);
        vec2 bend=lean*growth+wind*(up*lengthScale*(1.-cos(angle))/angle);
        vec3 transformed=root+vec3(bend.x,position.y*lengthScale*curl/angle-.009,bend.y);
        vColor.rgb*=meadowPigment(worldRoot.xz,stand,worldRoot.y)*mix(.95,1.10,gust*bladeSection);
        vColor.rgb=mix(vColor.rgb,vec3(.62,.67,.69),snowCover*.87*bladeSection);
      `);
      shader.fragmentShader='uniform sampler2D lawnTexture; varying vec2 bladeUv;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
        #include <color_fragment>
        float fiber=texture2D(lawnTexture,bladeUv).g;
        diffuseColor.rgb*=.84+.56*fiber;
      `).replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n normal*=faceDirection;');
    };
    return {...layer,material};
  });
  const cols=pos.count/rows;
  const grassAt=new Float32Array(pos.count);
  for(let k=0;k<pos.count;k++){
    const x=pos.getX(k),z=pos.getZ(k);
    const flecks=.055*Math.sin(x*.57+z*.41)+.067*Math.sin(x*.23-z*.61);
    const slope=T.MathUtils.smoothstep(normal.getY(k)+flecks,.63,.91);
    grassAt[k]=slope*T.MathUtils.smoothstep(pos.getY(k),1.2,2.8);
  }
  for(let west=0;west<cols-1;west+=12)for(let south=0;south<rows-1;south+=12){
    const origins:number[]=[],edgesB:number[]=[],edgesC:number[]=[],covers:number[]=[],stands:number[]=[],offsets:number[]=[];
    const box=new T.Box3(),pt=new T.Vector3();
    for(let i=west;i<Math.min(west+12,cols-1);i++)for(let j=south;j<Math.min(south+12,rows-1);j++){
      const a=i*rows+j,b=a+rows;
      for(const tri of [[a,b,a+1],[b,b+1,a+1]]){
        const cover=tri.map(k=>grassAt[k]!);
        if(Math.max(...cover)<.13)continue;
        const [p,q,r]=tri as [number,number,number];
        const x=Math.round(pos.getX(p)*2)+(p===a?0:1),z=Math.round(pos.getZ(p)*17);
        const angle=hash(x,z+117)*Math.PI*2;
        offsets.push(hash(x,z),hash(x+61,z),Math.cos(angle),Math.sin(angle));
        origins.push(pos.getX(p),pos.getY(p),pos.getZ(p));
        for(const [k,edge] of [[q,edgesB],[r,edgesC]] as const) {
          edge.push(pos.getX(k)-pos.getX(p),pos.getY(k)-pos.getY(p),pos.getZ(k)-pos.getZ(p));
        }
        covers.push(...cover);
        for(const k of tri){stands.push(habitat.getX(k));box.expandByPoint(pt.fromBufferAttribute(pos,k));}
      }
    }
    if(!origins.length)continue;
    box.expandByScalar(.95);
    const fields={corner:origins,edgeB:edgesB,edgeC:edgesC,turfCover:covers,treeCover:stands};
    const attrs=Object.entries(fields).map(([name,data])=>[name,new T.InstancedBufferAttribute(new Float32Array(data),3)] as const);
    const scatter=new T.InstancedBufferAttribute(new Float32Array(offsets),4);
    for(const {pattern,material,end} of layers){
      const g=new T.InstancedBufferGeometry();
      g.setAttribute('position',pattern.position);g.setAttribute('normal',pattern.normal);g.setAttribute('uv',pattern.uv);g.setAttribute('color',pattern.color);g.setIndex(pattern.index);
      for(const [name,attr] of attrs)g.setAttribute(name,attr);
      g.setAttribute('scatter',scatter);
      g.setAttribute('bladeSection',pattern.bladeSection);
      g.instanceCount=origins.length/3;g.boundingBox=box;g.boundingSphere=box.getBoundingSphere(new T.Sphere());
      const mesh=new T.Mesh(g,material);mesh.receiveShadow=true;group.add(mesh);sectors.push({mesh,box,range:end});
    }
  }
  function mow(x:number,z:number,radius:number) {
    const u=(x-min.x)/step-.5,v=(z-min.z)/step-.5,r=(radius+step*.7)/step;
    for(let j=Math.max(0,Math.floor(v-r));j<=Math.min(depth-1,v+r);j++)for(let i=Math.max(0,Math.floor(u-r));i<=Math.min(width-1,u+r);i++){
      const at=j*width+i,cut=1-T.MathUtils.smoothstep(Math.hypot(u-i,v-j)*step,radius-.12,radius+.18);
      pathData[at]=Math.max(pathData[at]!,Math.round(255*cut));
    }
  }
  return {group,mow,clearPaths(){pathData.fill(0);paths.needsUpdate=true;},view(){for(const {mesh,box,range} of sectors)mesh.visible=box.distanceToPoint(eye)<range;},dispose(){
    for(const {mesh} of sectors) mesh.geometry.dispose();
    for(const {material} of layers)material.dispose();
    paths.dispose();
  }};
}
