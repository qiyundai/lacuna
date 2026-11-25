import { Box3, MathUtils, Ray, Vector3 } from 'three';
import type { WaterfrontLot } from './harbor-streets.js';
import { inValley } from './valley-river.js';

export function buildingFront({model,site,doors}:WaterfrontLot,box:Box3){
  const preferred=model.getWorldDirection(new Vector3()).multiplyScalar(site.kind==='wharf'?-1:1);
  const center=box.getCenter(new Vector3()),size=box.getSize(new Vector3());
  let normal=preferred,entry=center,best=-Infinity;
  for(const door of doors){
    const facing=door.landing.clone().sub(door.threshold);
    facing.y=0;
    if(!facing.lengthSq())continue;
    facing.normalize();
    const alignment=facing.dot(preferred);
    if(alignment>best){
      best=alignment;normal=facing;entry=door.threshold;
    }
  }
  const target=center.clone();
  if(doors.length)target.addScaledVector(normal,entry.clone().sub(center).dot(normal));
  else if(site.kind!=='pines')target.addScaledVector(normal,.5*(Math.abs(normal.x)*size.x+Math.abs(normal.z)*size.z));
  const height=Math.max(1,box.max.y-Math.max(box.min.y,model.position.y));
  target.y=box.max.y-height*.52;
  return {normal,target,height,width:Math.abs(normal.z)*size.x+Math.abs(normal.x)*size.z};
}

export function facadeView(front:ReturnType<typeof buildingFront>,fov:number,aspect:number,room?:Vector3,neighbors:Box3[]=[]){
  const {normal,width,height}=front;
  const target=room?.clone()??front.target.clone();
  if(room)target.addScaledVector(normal,front.target.clone().sub(room).dot(normal));
  const halfFrame=Math.tan(MathUtils.degToRad(fov)*.5);
  const distance=room?Math.max(7,5/aspect):Math.max(7,.58*Math.max(height,width/aspect)/halfFrame);
  const ray=new Ray(),hit=new Vector3(),up=new Vector3(0,1,0);
  let eye=target.clone(),best=Infinity;
  for(const angle of [0,.28,-.28,.54,-.54]){
    const direction=normal.clone().applyAxisAngle(up,angle);
    let openDistance=distance,rise=distance*.39;
    const lowerEdge=target.y-Math.min(2,height*.27);
    for(const box of neighbors){
      if(box.max.y<lowerEdge)continue;
      ray.origin.set(target.x,box.max.y,target.z);
      ray.direction.copy(direction);
      if(!ray.intersectBox(box,hit))continue;
      const gap=ray.origin.distanceTo(hit);
      if(gap>distance+1)continue;
      openDistance=Math.min(openDistance,Math.max(0,gap-1));
      rise=Math.max(rise,(box.max.y+1-lowerEdge)*distance/Math.max(.25,gap)+lowerEdge-target.y);
    }
    const angleCost=Math.abs(angle)*.45;
    const highCost=angleCost+(rise/distance-.39);
    if(highCost<best){
      best=highCost;eye=target.clone().addScaledVector(direction,distance);eye.y+=rise;
    }
    const nearCost=angleCost+Math.log(distance/openDistance);
    if(openDistance>1.8 && nearCost<best){
      best=nearCost;eye=target.clone().addScaledVector(direction,openDistance);eye.y+=openDistance*.39;
    }
    if(best===0)break;
  }
  return {target:inValley(target),eye:inValley(eye)};
}
