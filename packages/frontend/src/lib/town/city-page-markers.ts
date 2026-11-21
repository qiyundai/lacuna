import * as T from 'three';
import type { Site } from './painted-coast.js';

export type PageMarker = { id:string; x:number; y:number };
export type CityParcel = { box:T.Box3; site:Site };

export function cityPageMarkers(canvas:HTMLCanvasElement,camera:T.PerspectiveCamera,city:T.Group,parcels:CityParcel[],
  publish:(markers:PageMarker[])=>void){
  const picker=new T.Raycaster(),pointer=new T.Vector2(),point=new T.Vector3(),inverse=new T.Matrix4();
  const projection=new T.Matrix4(),previous=new T.Matrix4();
  let hovered:Site|undefined,dirty=true,width=0,height=0;

  function pick(x:number,y:number){
    const rect=canvas.getBoundingClientRect();
    pointer.set(2*(x-rect.left)/rect.width-1,1-2*(y-rect.top)/rect.height);
    picker.setFromCamera(pointer,camera);
    const ray=picker.ray.applyMatrix4(inverse.copy(city.matrixWorld).invert());
    let distance=Infinity,found:Site|undefined;
    for(const {box,site} of parcels){
      if(!ray.intersectBox(box,point))continue;
      const next=point.distanceToSquared(ray.origin);
      if(next<distance){distance=next;found=site;}
    }
    return found;
  }
  function hover(site?:Site){
    if(site===hovered)return;
    hovered=site;dirty=true;
    canvas.style.cursor=site?'pointer':'';
  }
  function update(preferred?:Site,pageId?:string){
    projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(city.matrixWorld);
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!dirty&&w===width&&h===height&&previous.equals(projection))return;
    dirty=false;width=w;height=h;previous.copy(projection);
    const candidates=[];
    for(const {box,site} of parcels){
      box.getCenter(point);point.y=box.max.y;point.applyMatrix4(projection);
      const x=Math.round((point.x+1)*w/2),y=Math.round((1-point.y)*h/2);
      if(point.z<=-1||point.z>=1||x<66||x>w-66||y<94||y>h-100)continue;
      const priority=site===hovered?0:site===preferred?1:2;
      const id=site===preferred&&pageId?pageId:site.id;
      candidates.push({id,x,y,priority,distance:Math.hypot(x-w*.5,y-h*.5)});
    }
    candidates.sort((a,b)=>a.priority-b.priority||a.distance-b.distance);
    const chosen:PageMarker[]=[];
    for(const item of candidates){
      if(chosen.some(other=>Math.abs(item.x-other.x)<119&&Math.abs(item.y-other.y)<62))continue;
      chosen.push({id:item.id,x:item.x,y:item.y});
      if(chosen.length===(w<550?2:3))break;
    }
    publish(chosen);
  }
  return {pick,hover,update,invalidate(){hover();dirty=true;}};
}
