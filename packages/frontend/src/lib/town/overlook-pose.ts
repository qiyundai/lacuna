import { Euler, MathUtils, Object3D, Quaternion, Vector3 } from 'three';
import type { HillExchange, HillPose } from './overlook-walk.js';

export function overlookPose(model:Object3D,seed:number){
  const names=['Pelvis','Coat','Head','SleeveL','SleeveR','CuffL','CuffR','ThighL','ThighR','ShinL','ShinR','ShoeL','ShoeR'] as const;
  const bones=new Map(names.flatMap(name=>{
    const bone=model.getObjectByName(name);
    return bone?[[name,{bone,bind:bone.quaternion.clone(),prior:bone.quaternion.clone()}] as const]:[];
  }));
  const pelvis=bones.get('Pelvis')?.bone;
  const hip=pelvis?.position.y??1;
  const priorHip=new Vector3(),angle=new Euler(),rotation=new Quaternion();
  function bend(name:typeof names[number],amount:number,x:number,y=0,z=0){
    const joint=bones.get(name);
    if(!joint)return;
    rotation.setFromEuler(angle.set(x,y,z)).premultiply(joint.bind);
    joint.bone.quaternion.slerp(rotation,amount);
  }
  const direction=new Vector3(),local=new Vector3(),inverse=new Quaternion();
  function armChain(side:'L'|'R'){
    const shoulder=bones.get(`Sleeve${side}`),elbow=bones.get(`Cuff${side}`);
    if(!shoulder || !elbow)return;
    const upperAxis=elbow.bone.position.clone().normalize().applyQuaternion(shoulder.bind);
    const wrist=model.getObjectByName('Tote')?.position.clone()??new Vector3(0,1,0);
    if(side==='R')wrist.x*=-1;
    const forearmAxis=wrist.normalize().applyQuaternion(elbow.bind);
    return (amount:number,x:number,y:number,z:number,wx:number,wy:number,wz:number)=>{
      direction.set(x,y,z).normalize();
      rotation.setFromUnitVectors(upperAxis,direction).multiply(shoulder.bind);
      shoulder.bone.quaternion.slerp(rotation,amount);
      inverse.copy(shoulder.bone.quaternion).invert();
      local.set(wx,wy,wz).normalize().applyQuaternion(inverse);
      rotation.setFromUnitVectors(forearmAxis,local).multiply(elbow.bind);
      elbow.bone.quaternion.slerp(rotation,amount);
    };
  }
  const left=armChain('L'),right=armChain('R');
  const phase=seed%293,tempo=29+seed%9;
  return {reset(){
    for(const joint of bones.values())joint.bone.quaternion.copy(joint.prior);
    pelvis?.position.copy(priorHip);
  },apply(pose:HillPose,amount:number,tick:number,exchange?:HillExchange){
    if(!pelvis)return;
    for(const joint of bones.values())joint.prior.copy(joint.bone.quaternion);
    priorHip.copy(pelvis.position);
    const seated=pose==='knees-up'||pose==='legs-out',lean=pose==='leaning';
    const clock=tick+phase,breath=Math.sin(clock*2*Math.PI/tempo),shift=Math.sin(clock/39);
    const beat=clock%293;
    const look=exchange?.look??0,point=exchange?.point??0,nod=exchange?.nod??0;
    const shade=MathUtils.smootherstep(beat,41,57)*(1-MathUtils.smootherstep(beat,84,101))
      *(1-Math.min(1,Math.abs(look)+point+nod));
    const scan=Math.sin(clock/34+.7*Math.sin(clock/53));
    bend('Head',amount,.04-.16*shade+.23*nod+.025*breath,.24*scan+.75*look,(lean?-.09:.025)+.05*shift);
    bend('Coat',amount,(seated?(pose==='legs-out'?-.16:.14):.025)+.026*breath,
      .095*scan+.31*look-.14*point,(lean?.09:.02)+.055*shift);
    left?.(amount,.19,-1,seated?.63:.04,.02,seated?-.18:-.87,seated?.98:.47);
    const raise=shade+point;
    right?.(amount,-.15-.43*shade-.20*point,-1+1.19*shade+.86*point,
      (seated?.58:.07)+.79*raise+.035*breath,
      .11+.57*shade-.06*point,(lean?.18:seated?-.22:-.93)*(1-raise)+.76*shade+.08*point,
      (lean||seated?.92:.35)*(1-raise)+.12*shade+point);

    if(!seated)return;
    const seatedHeight=hip*.17;
    pelvis.position.y+=(seatedHeight-pelvis.position.y)*amount;
    for(const side of ['L','R'] as const){
      const shin=bones.get(`Shin${side}`),shoe=bones.get(`Shoe${side}`);
      if(!shin||!shoe)continue;
      const thighLength=shin.bone.position.length(),shinLength=shoe.bone.position.length();
      const ankleHeight=hip-thighLength-shinLength;
      const down=pelvis.position.y-ankleHeight;
      const reach=amount*(thighLength+shinLength)*(pose==='legs-out'?(side==='L'?.92:.72):(side==='L'?.43:.56));
      const distance=Math.hypot(reach,down);
      const cosine=(v:number)=>Math.acos(Math.max(-1,Math.min(1,v)));
      const thigh=Math.atan2(reach,down)+cosine((thighLength**2+distance**2-shinLength**2)/(2*thighLength*distance));
      const knee=Math.PI-cosine((thighLength**2+shinLength**2-distance**2)/(2*thighLength*shinLength));
      const planted=Math.min(1,amount*4);
      bend(`Thigh${side}`,planted,-thigh,0,amount*(side==='L'?-.09:.09));
      bend(`Shin${side}`,planted,knee);
      bend(`Shoe${side}`,planted,thigh-knee);
    }
  }};
}
