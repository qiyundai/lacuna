import { MathUtils, Vector3 } from 'three';
import { valleyOrigin } from './valley-river.js';

export const valleyZoomLimit=242;
const clamp=MathUtils.clamp;

export function constrainValleyView(eye:Vector3,target:Vector3,banks:{west:number;east:number},
  upstream:number,ground:(x:number,z:number)=>number,nearRadius:number,followingResident=false){
  const margin=followingResident?8:84;
  const west=banks.west+margin,east=banks.east-margin;
  const inset=followingResident?4:42;
  const targetX=clamp(target.x,west+inset,east-inset);
  const targetZ=clamp(target.z,upstream-56,valleyOrigin.z+(followingResident?405:185));
  eye.x+=targetX-target.x;eye.z+=targetZ-target.z;
  target.x=targetX;target.z=targetZ;

  function clearance(x:number,z:number){
    const r=nearRadius;
    return Math.max(0,ground(x,z),ground(x-r,z-r),ground(x+r,z-r),ground(x-r,z+r),ground(x+r,z+r))+r+1.3;
  }

  target.y=clamp(target.y,followingResident?ground(target.x,target.z)+.5:clearance(target.x,target.z)+1,followingResident?180:148);
  eye.x=clamp(eye.x,west,east);
  eye.z=clamp(eye.z,upstream-180,valleyOrigin.z+412);
  eye.y=clamp(eye.y,clearance(eye.x,eye.z),184);

  let dx=eye.x-target.x,dy=eye.y-target.y,dz=eye.z-target.z;
  const distance=Math.hypot(dx,dy,dz);
  if(distance<.001){eye.y=target.y+2;return;}
  const scale=Math.min(1,valleyZoomLimit/distance);
  dx*=scale;dy*=scale;dz*=scale;
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/1.2));
  const sightFloor=(t:number)=>{
    const x=target.x+dx*t,z=target.z+dz*t;
    return followingResident?MathUtils.lerp(ground(x,z)+.2,clearance(x,z),t):clearance(x,z);
  };
  let travel=1;
  for(let step=1;step<=steps;step++){
    const t=step/steps;
    if(target.y+dy*t>=sightFloor(t))continue;
    let lo=(step-1)/steps,hi=t;
    for(let i=0;i<8;i++){
      const mid=(lo+hi)*.5;
      if(target.y+dy*mid>=sightFloor(mid))lo=mid;
      else hi=mid;
    }
    travel=lo;
    break;
  }
  eye.set(target.x+dx*travel,target.y+dy*travel,target.z+dz*travel);
}
