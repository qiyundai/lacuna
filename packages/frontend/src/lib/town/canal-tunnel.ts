import * as T from 'three';
import { channelCenter, hiddenStation, portalStation, tunnelRadius } from './river-passage.js';
import { arch } from './architectural-parts.js';
import { createModelWorkshop } from './model-workshop.js';
import type { Workshop } from './harbor-workshop.js';

export function canalTunnel(shop:Workshop){
  const kit=createModelWorkshop(1,1,shop.paint);
  const portal=kit.module(p=>{
    const r=tunnelRadius;
    for(const side of [-1,1]){
      p.box('shade',side*(r+.53),-.37,-.52,1.06,3.94,1.22);
      p.box('lintel',side*(r+.49),1.45,.07,1.15,.25,.24);
    }
    arch(p,'shade',0,1.5,-1.15,r+1.03,4.83,1.04,1.33);
    arch(p,'lintel',0,1.5,.18,r+.42,4.22,.42,.19);
    p.box('stone',0,5.58,.31,.46,.54,.28);
  });
  portal.position.set(portalStation,0,channelCenter(portalStation));
  portal.rotation.y=Math.PI/2;
  const positions:number[]=[],indices:number[]=[],uv:number[]=[];
  const sections=56,sides=20,cols=sides+3;
  for(let i=0;i<=sections;i++){
    const station=T.MathUtils.lerp(portalStation,hiddenStation-12,i/sections);
    for(let j=0;j<cols;j++){
      const angle=Math.PI*T.MathUtils.clamp((j-1)/sides,0,1);
      const y=j===0||j===cols-1?-3.4:1.5+3.8*Math.sin(angle);
      positions.push(station,y,channelCenter(station)+tunnelRadius*Math.cos(angle));
      uv.push(station*.36,j*.32);
      if(i&&j){
        const k=i*cols+j;
        indices.push(k-cols-1,k-cols,k-1,k-cols,k,k-1);
      }
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const lining=new T.MeshStandardMaterial({color:'#514843',roughness:.97,side:T.DoubleSide});
  const group=new T.Group();group.add(portal,new T.Mesh(geometry,lining));
  return {group,dispose(){kit.dispose();geometry.dispose();lining.dispose();}};
}
