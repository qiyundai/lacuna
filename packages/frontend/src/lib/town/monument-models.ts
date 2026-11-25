import * as T from 'three';
import { createModelWorkshop } from './model-workshop.js';
import { batchPlantings } from './tree-batches.js';
import type { Workshop } from './harbor-workshop.js';
import type { MonumentPlot } from './monument-placement.js';
import { monumentLamps } from './monument-light.js';
import { monuments, type MonumentId } from '../../../../shared/monuments.js';
import { cliffPostOffice, mailCrate, cablePoint, postOfficeSlope, bellYard, tideOrgan } from './monument-halls.js';
import { winterGarden, sakura, blossomCrown } from './monument-winter-garden.js';
import { exchangeBank, exchangeRigging, wovenLinen } from './monument-crossings.js';

type Ground=(x:number,z:number)=>number;
type GroundGrade=(x:number,z:number,height:number)=>number;

function makeLandmark(plot:MonumentPlot,shop:Workshop,ground:Ground) {
  const {id,lots,seed}=plot,first=lots[0]!,base=ground(first.x,first.z);
  const kit=createModelWorkshop(6,4,shop.paint,false,shop.clockHour,shop.breezeTime);
  const resources:{dispose:()=>void}[]=[],group=new T.Group();
  let tick:((time:number)=>void)|undefined;
  group.rotation.y=plot.yaw;
  group.position.set(first.x,base,first.z);
  const surface=(x:number,z:number)=>ground(first.x+x,first.z+z)-base;
  const localSurface=(x:number,z:number)=>{
    const c=Math.cos(group.rotation.y),s=Math.sin(group.rotation.y);
    return surface(c*x+s*z,c*z-s*x);
  };
  const plantings=shop.treeModels.map(()=>[] as T.Matrix4[]);
  const plant=(x:number,y:number,z:number,h:number,seed:number)=>{
    const spread=h*(.96+.16*Math.sin(seed));
    const matrix=new T.Matrix4().makeRotationY(seed*2.39996).scale(new T.Vector3(spread,h,spread)).setPosition(x,y-.035,z);
    plantings[seed%plantings.length]!.push(matrix);
  };
  const aim=new T.Vector3(),bearing=new T.Vector3();
  let distance=46,width=38;
  let gradeBanks:GroundGrade|undefined;
  switch(id){
    case 'post-office':{
      group.add(kit.module(cliffPostOffice));
      const crate=kit.module(mailCrate);crate.name='Mail carrier';
      const carriers=Array.from({length:4},(_,i)=>{const car=i?crate.clone():crate;group.add(car);return car;});
      tick=time=>{for(const [i,car] of carriers.entries()){
        const leg=i>>1,side=i%2?1:-1,phase=time*(leg?.26:.31)+(seed%641)*.013+leg*.9;
        const t=.5+side*.49*T.MathUtils.clamp(1.12*Math.sin(phase),-1,1);
        cablePoint(leg,side,t,car.position);
        car.rotation.z=.03*Math.cos(phase)*Math.sin(Math.PI*t);
      }};
      tick(0);
      for(let i=0;i<42;i++){
        const x=-20+13*(1+Math.sin(i*2.399))+i%4,z=-8+8.8*(1+Math.cos(i*1.21));
        if((x>1&&z>5)||(x<-.5&&z<-6)||(x<-11&&z>8))continue;
        plant(x,postOfficeSlope(x,z,localSurface(x,z)),z,1.5+(i%4)*.68,i+29);
      }
      aim.set(-1,14.6,.3);bearing.set(.29,.38,1);distance=60;width=54;
      break;
    }
    case 'bell-yard':{
      group.add(kit.module(bellYard));
      for(const [x,z,h,seed] of [[-14,5,5.3,4],[-9,-10,6.3,12],[12,4,4.4,2],[11,-8,5.9,6]] as const)plant(x,2.75,z,h,seed);
      for(let i=0;i<15;i++){
        const a=(i+.5)*Math.PI*2/15;
        if(Math.sin(a)>.86)continue;
        plant(16.8*Math.cos(a),2.73,11.7*Math.sin(a),1.25+.6*Math.cos(i*2.3),i+41);
      }
      aim.set(0,8.2,0);bearing.set(-.43,.14,1);distance=45;width=42;
      break;
    }
    case 'linen-exchange':{
      const other=lots[1]!,span=other.z-first.z,rise=surface(0,span);
      gradeBanks=(station,across,height)=>{
        const x=station-first.x;
        if(Math.abs(x)>21)return height;
        const left=Math.abs(across-first.z)<Math.abs(across-other.z);
        const depth=left?across-first.z:other.z-across;
        const outside=Math.max(Math.abs(x)-13.7,depth-4.7,-27.6-depth);
        const weight=1-T.MathUtils.smoothstep(outside,0,6.6);
        const terrace=base+(left?0:rise)+Math.max(0,-depth-4)*.18-.23;
        return T.MathUtils.lerp(height,terrace,weight);
      };
      group.add(kit.module(p=>{
        exchangeBank(p,1);p.at(0,rise,span,0,()=>exchangeBank(p,-1));exchangeRigging(p,span,rise);
      }));
      const linen=wovenLinen(span,rise,shop.breezeTime);
      resources.push(linen.geometry,linen.material,linen.material.map!,linen.customDepthMaterial!);group.add(linen);
      for(const side of [1,-1]){
        const bank=side===1?0:span;
        for(let i=0;i<35;i++){
          const x=-16.2+Math.sin(i*2.399)*7.3+(i%4)*6.8;
          const z=bank+side*(9+i*.88+4.2*Math.sin(i*1.22));
          if(Math.abs(x+8.7)<2 && Math.abs(z-bank)<17)continue;
          plant(x,surface(x,z),z,3+.95*Math.sin(i)+1.6*(i%3),i+(side===1?21:13));
        }
      }
      aim.set(0,13+rise/2,span/2);bearing.set(-1,.27,.135);distance=91;width=span+57;break;
    }
    case 'winter-garden':{
      const shell=kit.module(winterGarden);
      shell.traverse(part=>{
        if(!(part instanceof T.Mesh)||!(part.material instanceof T.MeshStandardMaterial)||!part.material.transparent)return;
        const glazing=part.material.clone();
        glazing.opacity=.15;glazing.side=T.DoubleSide;glazing.forceSinglePass=true;
        glazing.roughness=.17;part.material=glazing;resources.push(glazing);
      });
      let buds:ReturnType<typeof sakura>=[];
      const tree=kit.module(p=>{buds=sakura(p);});
      const blossoms=blossomCrown(buds);
      resources.push(blossoms.geometry,blossoms.material);group.add(shell,tree,blossoms);
      aim.set(0,11.6,0);bearing.set(.67,.17,1);distance=49;width=38;break;
    }
    case 'tide-organ':{
      group.add(kit.module(tideOrgan));
      aim.set(0,12.5,0);bearing.set(-.73,.19,1);distance=54;width=40;break;
    }
  }
  for(const [i,matrices] of plantings.entries()){
    if(!matrices.length)continue;
    const template=shop.treeModels[i]!.children[0] as T.Mesh<T.BufferGeometry,T.Material>;
    const planting=batchPlantings(template.geometry,template.material,matrices);
    planting.traverse(part=>{if(part instanceof T.InstancedMesh)resources.push(part);});
    group.add(planting);
  }
  const yaw=group.rotation.y,axis=new T.Vector3(0,1,0);
  aim.applyAxisAngle(axis,yaw).add(group.position);bearing.applyAxisAngle(axis,yaw).normalize();
  group.name=monuments.find(m=>m.id===id)!.name;
  const c=Math.cos(yaw),s=Math.sin(yaw);
  function grade(station:number,across:number,height:number){
    const dx=station-first.x,dz=across-first.z;
    if(Math.abs(dx)>34 || Math.abs(dz)>34)return height;
    const x=c*dx-s*dz,z=s*dx+c*dz;
    const natural=height-base;
    if(id==='post-office')return base+postOfficeSlope(x,z,natural);
    const outside=id==='bell-yard'?(Math.hypot(x/18.2,z/13.7)-1)*14:Math.max(Math.abs(x)-16.2,Math.abs(z)-11);
    const floor=id==='bell-yard'?1.55:.2,weight=1-T.MathUtils.smoothstep(outside,-.5,5);
    return T.MathUtils.lerp(height,base+floor,weight);
  }
  const extent=lots[1]?lots[1].z-first.z:0;
  const sources=monumentLamps(id,group,kit.module,extent,surface(0,extent),seed);
  kit.glazing.emissive.setRGB(1,.54,.23);
  return {plot,group,sources,tick,applyLight(power:number){
    kit.glazing.emissiveIntensity=.30*power;kit.bulbs.color.setScalar(.52+power*2.2);
  },dispose(){for(const resource of resources)resource.dispose();kit.dispose();},
    exposure(x:number,z:number,h:number){return T.MathUtils.smoothstep(grade(x,z,h)-h,.24,5.8);},target:aim,direction:new T.Vector3(bearing.z,bearing.y,-bearing.x),distance,width,
    grade:gradeBanks??(id==='post-office'||id==='bell-yard'||id==='winter-garden'?grade:undefined)};
}

export function cityMonuments(shop:Workshop,ground:Ground) {
  const root=new T.Group();
  const built=new Map<MonumentId,ReturnType<typeof makeLandmark>>();
  const sources:ReturnType<typeof monumentLamps>=[];
  let clearings:MonumentPlot['lots']=[];
  return {
    root,sources,
    update(plots:readonly MonumentPlot[]){
      let changed=false;
      for(const [id,model] of built){
        const next=plots.find(p=>p.id===id);
        if(next && next.seed===model.plot.seed && next.yaw===model.plot.yaw && next.lots.every((p,i)=>p.x===model.plot.lots[i]?.x && p.z===model.plot.lots[i]?.z))continue;
        root.remove(model.group);model.dispose();built.delete(id);changed=true;
      }
      for(const plot of plots)if(!built.has(plot.id)){
        const model=makeLandmark(plot,shop,ground);built.set(plot.id,model);root.add(model.group);changed=true;
      }
      if(changed){sources.length=0;for(const model of built.values())sources.push(...model.sources);
        clearings=plots.flatMap(p=>p.lots);
      }
      return changed;
    },
    range(left:number,right:number){
      let lo=left,hi=right;
      for(const {plot} of built.values()){const x=plot.lots[0]!.x;if(x>=left-200 && x<=right+200){lo=Math.min(lo,x-38);hi=Math.max(hi,x+38);}}
      return [lo,hi] as const;
    },
    cleared(x:number,z:number){return clearings.some(l=>Math.abs(x-l.x)<l.along && Math.abs(z-l.z)<l.across);},
    tick(time:number,power:number){for(const model of built.values()){model.tick?.(time);model.applyLight(power);}},
    grade(x:number,z:number,height:number){
      for(const model of built.values())if(model.grade)height=model.grade(x,z,height);
      return height;
    },
    exposure(x:number,z:number,h:number){return built.get('post-office')?.exposure(x,z,h)??0;},
    view(id:MonumentId){return built.get(id);},
    dispose(){for(const model of built.values())model.dispose();root.clear();built.clear();}
  };
}
