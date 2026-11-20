import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { hashPage } from './city-growth.js';
import type { Workshop } from './harbor-workshop.js';
import type { WaterfrontLot } from './harbor-streets.js';
import { landHeight, laneDepth, shoreline } from './valley-river.js';

export async function loadGardenPlants(){
  const loader=new GLTFLoader();
  const pigments=new Map<string,T.MeshStandardMaterial>();
  const geometries=new Set<T.BufferGeometry>();
  const plants=await Promise.all(['flower_yellowA','crops_leafsStageB'].map(async name=>{
    const model=await loader.loadAsync('/town/land/'+name+'.glb').catch(()=>undefined);
    const plant=new T.Group();
    if(!model)return plant;
    model.scene.updateMatrixWorld(true);
    const original=new Set<T.Material>();
    model.scene.traverse(part=>{
      if(!(part instanceof T.Mesh))return;
      const source=part.material as T.MeshStandardMaterial;
      original.add(source);
      const key=source.name;
      let pigment=pigments.get(key);
      if(!pigment){
        pigment=new T.MeshStandardMaterial({color:key==='colorYellow'?'#f3ce85':'#719052',roughness:.95,side:T.DoubleSide});
        pigments.set(key,pigment);
      }
      const mesh=new T.Mesh(part.geometry,pigment);
      mesh.applyMatrix4(part.matrixWorld);plant.add(mesh);geometries.add(part.geometry);
    });
    for(const material of original)material.dispose();
    return plant;
  }));
  return {plants,dispose(){for(const g of geometries)g.dispose();for(const m of pigments.values())m.dispose();}};
}

type Strip={position:number[];uv:number[];index:number[]};

function strip(target:Strip,rows:T.Vector3[][]){
  const base=target.position.length/3,count=rows[0]!.length;
  for(const [i,row] of rows.entries())for(const [j,p] of row.entries()){
    target.position.push(p.x,p.y,p.z);target.uv.push(p.x*.48,p.z*.48+p.y*.14);
    if(i&&j){
      const k=base+i*count+j;
      target.index.push(k-count-1,k-count,k-1,k-count,k,k-1);
    }
  }
}

export function gardenClearance(){
  const occupied=new Map<number,Set<number>>();
  function mark(x:number,z:number,radius:number){
    for(let i=Math.floor(x-radius);i<=Math.floor(x+radius);i++){
      let row=occupied.get(i);
      if(!row){row=new Set();occupied.set(i,row);}
      for(let j=Math.floor(z-radius);j<=Math.floor(z+radius);j++)row.add(j);
    }
  }
  return {mark,has:(x:number,z:number)=>occupied.get(Math.floor(x))?.has(Math.floor(z))??false};
}

export function cutBuildingPlots(lots:WaterfrontLot[],walks:ReturnType<typeof gardenClearance>){
  const plots=new Map<number,{x:number;z:number;y:number;cos:number;sin:number;width:number}[]>();
  for(const {site,model} of lots){
    if(site.kind==='wharf'||site.kind==='pines')continue;
    const {x,y,z}=model.position;
    const plot={x,y,z,cos:Math.cos(model.rotation.y),sin:Math.sin(model.rotation.y),width:site.width/35+.8};
    for(let i=Math.floor((x-10)/10);i<=Math.floor((x+10)/10);i++){
      const bucket=plots.get(i)??[];bucket.push(plot);plots.set(i,bucket);
    }
  }
  return (x:number,z:number,natural:number)=>{
    const bucket=plots.get(Math.floor(x/10));
    if(!bucket||walks.has(x,z))return natural;
    let height=natural;
    for(const plot of bucket){
      const dx=x-plot.x,dz=z-plot.z;
      const along=Math.abs(dx*plot.cos-dz*plot.sin),across=dx*plot.sin+dz*plot.cos;
      const weight=(1-T.MathUtils.smoothstep(along,plot.width,plot.width+1.6))*
        (1-T.MathUtils.smoothstep(Math.abs(across+.9),2.7,5.2));
      height=Math.min(height,natural-weight*T.MathUtils.clamp(natural-plot.y+.12,0,1.5));
    }
    return height;
  };
}

export function landscapeWaterfront(shop:Workshop,plants:T.Group[],lots:WaterfrontLot[],
  reserved:ReturnType<typeof gardenClearance>,grade:ReturnType<typeof cutBuildingPlots>,buildings:T.Box3[],ground:T.Group,planting:T.Group,details:T.Group,mow:(x:number,z:number,r:number)=>void){
  if(!lots.length)return;
  const batches=new Map<T.Material,Strip>();
  function surface(material:T.Material,rows:T.Vector3[][]){
    let batch=batches.get(material);
    if(!batch){batch={position:[],uv:[],index:[]};batches.set(material,batch);}
    strip(batch,rows);
  }
  function open(x:number,z:number,r:number){
    return !reserved.has(x,z)&&!buildings.some(b=>x>b.min.x-r&&x<b.max.x+r&&z>b.min.z-r&&z<b.max.z+r);
  }
  const patches=new Map<number,T.Matrix4[][]>(),sprig=new T.Object3D();
  function plant(kind:number,x:number,y:number,z:number,size:number,seed:number){
    const tile=Math.floor(x/24),patch=patches.get(tile)??[[],[]];
    sprig.position.set(x-tile*24-12,y,z);sprig.rotation.y=seed*2.4;sprig.scale.setScalar(size);sprig.updateMatrix();
    patch[kind]!.push(sprig.matrix.clone());patches.set(tile,patch);
  }
  const cells=new Map<string,{column:number;lane:number;lot?:WaterfrontLot}>();
  for(const lot of lots){
    const lane=lot.site.kind==='wharf'?3:lot.site.lane;
    const column=Math.round((lot.site.x-132-lot.site.lane*8)/157);
    const neighbors:[number,number][]=[[-1,0],[1,0],[0,-1],[0,1],[0,0]];
    if(lane<3&&lots.length>=5)neighbors.push([-2,0],[2,0],[2,-1],[-2,-1]);
    if(lane===1&&lots.length>=10)neighbors.push([3,0],[-3,0]);
    for(const [dc,dl] of neighbors){
      const c=column+dc,l=lane+dl,key=c+','+l;
      if(l< -1||l>3)continue;
      if(!dc&&!dl)cells.set(key,{column:c,lane:l,lot});
      else if(!cells.has(key))cells.set(key,{column:c,lane:l});
    }
  }
  for(const {column,lane,lot} of cells.values()){
    const seed=hashPage(column+','+lane);
    const center=(132+column*157+lane*8-900)/12.5;
    const nearby=buildings.filter(b=>b.max.x>=center-10&&b.min.x<=center+10);
    const depth=(x:number)=>lane<0?43+.9*Math.sin(x*.11):laneDepth(x,lane);
    const quay=lane===3, garden=!lot||lot.site.kind==='pines';
    const west=cells.has((column-1)+','+lane),east=cells.has((column+1)+','+lane);
    const rows:T.Vector3[][]=[],faces:T.Vector3[][]=[],caps:T.Vector3[][]=[],verges:T.Vector3[][]=[];
    const point=(u:number,v:number)=>{
      const x=center+(u-.5)*12.56;
      const bend=Math.sin(x*.22+lane*.9)*.64+Math.sin(x*.49)*.25;
      const taper=garden?Math.min(west?1:.18+.82*T.MathUtils.smootherstep(u,0,.92),east?1:.18+.82*T.MathUtils.smootherstep(1-u,0,.92)):1;
      const inner=quay?-3.6:-5.15*taper+bend;
      const outer=quay?(lot?1.2:3.2)+bend:(garden?4.7:3.85)*taper+bend;
      const z=shoreline(x)-depth(x)+T.MathUtils.lerp(inner,outer,v);
      const natural=grade(x,z,landHeight(x,z));
      let y=natural+.075;
      if(garden&&!quay){
        const innerHeight=landHeight(x,shoreline(x)-depth(x)+inner);
        const end=Math.min(west?1:T.MathUtils.smoothstep(u,0,.35),east?1:T.MathUtils.smoothstep(1-u,0,.35));
        y+=Math.min(1.48,Math.max(0,innerHeight-natural)*.82)*end;
      }else if(lot&&!quay){
        const weight=(1-T.MathUtils.smoothstep(v,.38,.86))*T.MathUtils.smoothstep(Math.min(u,1-u),0,.2);
        y+=T.MathUtils.clamp(lot.model.position.y-.14-y,0,1.15)*weight;
      }
      if(reserved.has(x,z))y=Math.min(y,natural+.04);
      return new T.Vector3(x,y,z);
    };
    for(let i=0;i<=16;i++){
      const u=i/16,row=Array.from({length:9},(_,j)=>point(u,j/8));
      const front=row[8]!;
      const foot=new T.Vector3(front.x,Math.min(front.y-.12,landHeight(front.x,front.z+.24)-.18),front.z+.24);
      rows.push(row);
      faces.push([front,foot]);
      caps.push([new T.Vector3(front.x,front.y+.025,front.z-.15),new T.Vector3(front.x,front.y+.03,front.z+.09)]);
      verges.push([row[0]!.clone(),point(u,.10)]);
      for(const p of verges[i]!)p.y+=.035;
      if(!garden)for(let j=0;j<row.length;j+=2)mow(row[j]!.x,row[j]!.z,1.05);
    }
    surface(garden&&!quay?shop.materials.gardenEarth:quay&&!lot?shop.materials.shingle:shop.materials.court,rows);
    if(!quay||lot){
      surface(shop.materials.ashlar,faces);
      surface(shop.materials.coping,caps);
    }
    if(garden&&!quay)surface(shop.materials.gravel,verges);
    if(lot&&!quay){
      let best:T.Vector3|undefined,bestRadius=0;
      for(let i=1;i<16;i++)for(let j=1;j<8;j++){
        const q=rows[i]![j]!;
        if(!open(q.x,q.z,.43))continue;
        let radius=2.25;
        for(const b of nearby)radius=Math.min(radius,Math.hypot(Math.max(b.min.x-q.x,0,q.x-b.max.x),Math.max(b.min.z-q.z,0,q.z-b.max.z)));
        while(radius>.85&&[0,1,2,3,4,5,6,7].some(k=>reserved.has(q.x+Math.cos(k*Math.PI/4)*radius,q.z+Math.sin(k*Math.PI/4)*radius)))radius-=.3;
        if(radius>bestRadius){bestRadius=radius;best=q;}
      }
      if(best&&bestRadius>.85){
        const bed=best,r=bestRadius*.8;
        const bedTop:T.Vector3[][]=[],rim:T.Vector3[][]=[];
        for(let i=0;i<=24;i++){
          const angle=i*Math.PI/12,spread=r*(1+.12*Math.sin(3*angle+seed));
          const x=bed.x+spread*Math.cos(angle),z=bed.z+spread*.79*Math.sin(angle);
          const top=bed.y+.19;
          bedTop.push([new T.Vector3(x,top,z),new T.Vector3(bed.x,top,bed.z)]);
          rim.push([new T.Vector3(x,Math.min(landHeight(x,z)-.12,top-.25),z),new T.Vector3(x,top,z)]);
        }
        surface(shop.materials.gardenEarth,bedTop);surface(shop.materials.ashlar,rim);
        shop.tree(planting,bed.x,bed.y+.16,bed.z,3.2+bestRadius*.85,seed-seed%3+1);
        for(let k=0;k<24;k++){
          const angle=k*2.4,radius=r*Math.sqrt((k+.5)/24);
          plant(k%3===0?1:0,bed.x+Math.cos(angle)*radius,bed.y+.19,bed.z+Math.sin(angle)*radius*.79,1.2,seed+k);
        }
      }
    }
    for(let i=0;i<(garden?70:22);i++){
      const bits=Math.imul(hashPage(seed+'/'+i),0x85ebca6b);
      const h=(bits^(bits>>>16))>>>0,u=(.5+(h&1023))/1024,v=(.5+((h>>>10)&1023))/1024;
      const q=point(u,v);
      if(!open(q.x,q.z,.24)||q.y<-.28)continue;
      if(!garden && v>.86)continue;
      if(garden && !quay && i<6 && v>.15 && open(q.x,q.z,1.3)){
        shop.tree(planting,q.x,q.y,q.z,3.8+(h>>>24)/95,h-h%3+i%2);
      }else if(i%(garden?4:6)===0&&!quay&&open(q.x,q.z,.65)){
        shop.tree(planting,q.x,q.y,q.z,(garden?1.02:.62)+(h>>>24)/220,h-h%3+1);
      }else{
        const kind=quay||i%4===0?1:0;
        const scale=kind===1?.84+(h>>>24)/450:1.25+(h>>>24)/245;
        for(let k=0;k<4;k++){
          const s=point(T.MathUtils.clamp(u+.026*Math.sin(h+k*2),0,1),T.MathUtils.clamp(v+.053*Math.cos(h+k*2),0,1));
          if(open(s.x,s.z,.1))plant(kind,s.x,s.y,s.z,scale,h+k);
        }
      }
    }
  }
  const stations=lots.map(lot=>lot.model.position.x);
  const reach=Math.min(36,6+lots.length),from=Math.floor(Math.min(...stations)-reach),to=Math.ceil(Math.max(...stations)+reach);
  const bank:T.Vector3[][]=[];
  for(let x=from;x<=to;x+=.5){
    const edge=shoreline(x),meander=.5+.5*Math.sin(x*.15+.7*Math.sin(x*.061));
    const fade=T.MathUtils.smoothstep(Math.min(x-from,to-x),0,9);
    const upper=edge-(.4+2.2*meander)*fade,lower=edge+2.1;
    bank.push(Array.from({length:7},(_,i)=>{
      const z=T.MathUtils.lerp(upper,lower,i/6);
      return new T.Vector3(x,landHeight(x,z)+.06+.12*fade*Math.sin(Math.PI*i/6),z);
    }));
    if(meander<.36||!open(x,edge,1.1))continue;
    const seed=hashPage('bank/'+x);
    for(let j=0;j<6;j++){
      const offset=Math.sin(seed+j*2.4),z=edge-.6+1.5*offset;
      const y=landHeight(x,z)+.13;
      if(!open(x,z,.4))continue;
      if(j%3===0){
        const size=.42+meander*.46;
        shop.piece(planting,shop.geometries.pebble,'pebble',x,y+.03,z,size,.40*size,.74*size,offset);
      }else plant(1,x+.19*offset,y,z,1.45+meander*.80,seed+j);
    }
  }
  surface(shop.materials.shingle,bank);
  const matrix=new T.Matrix4();
  for(const [tile,patch] of patches){
    const stand=new T.Group();
    plants.forEach((plantModel,kind)=>{
      const transforms=patch[kind]!;
      if(!transforms.length)return;
      for(const part of plantModel.children){
        if(!(part instanceof T.Mesh))continue;
        part.updateMatrix();
        const instances=new T.InstancedMesh(part.geometry,part.material,transforms.length);
        transforms.forEach((placement,i)=>instances.setMatrixAt(i,matrix.multiplyMatrices(placement,part.matrix)));
        instances.receiveShadow=true;stand.add(instances);
      }
    });
    const lod=new T.LOD();
    lod.position.x=tile*24+12;lod.addLevel(stand,0);lod.addLevel(new T.Group(),170,.12);details.add(lod);
  }
  for(const [material,data] of batches){
    const g=new T.BufferGeometry();
    g.setIndex(data.index);g.setAttribute('position',new T.Float32BufferAttribute(data.position,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));g.computeVertexNormals();
    const mesh=new T.Mesh(g,material);mesh.receiveShadow=true;mesh.castShadow=true;ground.add(mesh);
  }
}
