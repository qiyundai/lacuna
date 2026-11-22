import * as T from 'three';
import { arch } from './architectural-parts.js';
import { createModelWorkshop } from './model-workshop.js';
import { channelCenter } from './river-passage.js';
import type { Gouache } from './gouache.js';

export function footbridge(near:T.Vector3,far:T.Vector3,paint?:Gouache){
  const axis=far.clone().sub(near).setY(0),length=axis.length();
  axis.normalize();
  const center=(channelCenter((near.x+far.x)*.5)-near.z)/axis.z;
  const navigation=Math.min(4.1,Math.max(3.45,length*.165),center*.53,(length-center)*.53);
  const joint=[0];
  function spans(end:number,count:number){
    const start=joint.at(-1)!;
    for(let i=1;i<=count;i++)joint.push(T.MathUtils.lerp(start,end,i/count));
  }
  spans(center-navigation,Math.max(2,Math.ceil((center-navigation)/3.1)));
  spans(center+navigation,1);
  spans(length,Math.max(2,Math.ceil((length-center-navigation)/3.1)));
  const crown=Math.max(3.7,near.y,far.y);
  function grade(x:number){
    const side=x<center?near:far,run=x<center?center-navigation:length-center-navigation;
    const u=T.MathUtils.clamp((x<center?x:length-x)/run,0,1);
    return T.MathUtils.lerp(side.y,crown,u*(2-u));
  }
  const kit=createModelWorkshop(1,1,paint);
  const deck=kit.module(p=>{
    for(let i=1;i<joint.length;i++){
      const a=joint[i-1]!,b=joint[i]!,mid=(a+b)/2,half=(b-a)/2;
      const low=Math.min(grade(a),grade(b));
      const spring=Math.min(.34,low-1.18),rise=low-spring-.27;
      const radius=half-Math.min(.28,half*.24);
      const body=new T.Shape();
      body.moveTo(a,-3.35);body.lineTo(mid-radius,-3.35);body.lineTo(mid-radius,spring);
      body.absellipse(mid,spring,radius,rise,Math.PI,0,true,0);
      body.lineTo(mid+radius,-3.35);body.lineTo(b,-3.35);body.lineTo(b,grade(b)-.09);body.lineTo(a,grade(a)-.09);body.closePath();
      p.relief('shade',body,1.64,0,0,-.82);
      const cap=new T.Shape();
      cap.moveTo(a,grade(a)-.14);cap.lineTo(b,grade(b)-.14);cap.lineTo(b,grade(b));cap.lineTo(a,grade(a));cap.closePath();
      p.relief('stone',cap,1.84,0,0,-.92);
      for(const side of [-1,1]){
        arch(p,'lintel',mid,spring,side===1?.82:-.92,radius+.13,rise+.13,.14,.10);
        const z=side*.87;
        p.rod('iron',p.vec(a,grade(a)+.59,z),p.vec(b,grade(b)+.59,z),.034);
        const posts=Math.ceil((b-a)/1.35);
        for(let j=0;j<posts;j++){
          const x=T.MathUtils.lerp(a,b,j/posts),y=T.MathUtils.lerp(grade(a),grade(b),j/posts);
          p.box('iron',x,y+.28,z,.052,.57,.052);
        }
        if(i===joint.length-1)p.box('iron',b,grade(b)+.28,z,.052,.57,.052);
        if(i<joint.length-1)p.box('lintel',b,spring,z,.59,.15,.16);
      }
    }
  });
  deck.rotation.y=-Math.atan2(axis.z,axis.x);
  deck.position.set(near.x,0,near.z);
  return {deck,dispose:kit.dispose};
}
