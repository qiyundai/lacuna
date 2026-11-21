import { Vector3, Vector4 } from 'three';
import { valleyOrigin } from './valley-river.js';

export const wakeSamples=20;
export const wakeLifetime=9;

export function ferryWake() {
  const trail={value:Array.from({length:wakeSamples},()=>new Vector4())};
  const count={value:0};
  const bounds={value:new Vector4()};
  const previous=new Vector3();
  let lastSample=-Infinity;
  function clear() {
    count.value=0;
    lastSample=-Infinity;
  }
  function sample(hull:Vector3,heading:Vector3,time:number,visible:boolean) {
    if(!visible){clear();return;}
    const elapsed=time-lastSample;
    if(elapsed<.45)return;
    const speed=Number.isFinite(elapsed)?Math.hypot(hull.x-previous.x,hull.z-previous.z)/elapsed:0;
    previous.copy(hull);
    lastSample=time;
    const points=trail.value;
    for(let i=Math.min(count.value,wakeSamples-1);i>0;i--)points[i]!.copy(points[i-1]!);
    const x=valleyOrigin.x+hull.z-heading.z*1.85;
    const z=valleyOrigin.z-hull.x+heading.x*1.85;
    points[0]!.set(x,z,time,Math.min(speed/1.6,1));
    count.value=Math.min(wakeSamples,count.value+1);
    bounds.value.set(x,z,x,z);
    for(let i=1;i<count.value;i++){
      const p=points[i]!,b=bounds.value;
      b.x=Math.min(b.x,p.x);b.y=Math.min(b.y,p.y);
      b.z=Math.max(b.z,p.x);b.w=Math.max(b.w,p.y);
    }
  }
  return {trail,count,bounds,sample,clear};
}
