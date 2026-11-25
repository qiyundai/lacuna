import * as T from 'three';
import { arch, roof, tileCourses, around } from './architectural-parts.js';
import type { ModelTools, Pigment } from './model-workshop.js';

export type Parts = ModelTools;
const pi=Math.PI;

export function stoneArch(p:Parts,x:number,y:number,z:number,r:number,h:number,band:number,depth:number) {
  arch(p,'shade',x,y,z,r,h,band,depth*.8);
  const count=Math.max(9,Math.min(23,Math.round(r*2)|1));
  for(let i=0;i<count;i++){
    const a=pi*(i+.025)/count,b=pi*(i+.975)/count;
    const key=i===(count-1)/2,outer=key?band*.22:0;
    const shape=new T.Shape();
    shape.moveTo((r+outer)*Math.cos(a),(h+outer)*Math.sin(a));
    shape.absellipse(0,0,r+outer,h+outer,a,b,false,0);
    shape.absellipse(0,0,r-band,h-band,b,a,true,0);
    shape.closePath();
    p.relief(i%5===1?'chalk':key?'lintel':'stone',shape,depth,x,y,z+.015);
  }
}

export function spandrel(p:Parts,x:number,z:number,width:number,depth:number,spring:number,rise:number,left:number,right:number,wall:Pigment) {
  const r=width/2,shape=new T.Shape();
  shape.moveTo(-r,0);shape.absellipse(0,0,r,rise,pi,0,true,0);
  shape.lineTo(r,right-spring);shape.lineTo(-r,left-spring);shape.closePath();
  p.relief(wall,shape,depth,x,spring,z-depth/2);
}

export function arcade(p:Parts,width:number,depth:number,bays:number,height:number,wall:Pigment='oxblood',footing=0) {
  const pitch=width/bays,leg=Math.min(pitch*.22,1),r=(pitch-leg)/2,rise=Math.min(r,height*.58),spring=height-rise-.48;
  for(let i=0;i<=bays;i++){
    const x=i*pitch-width/2;
    p.box(wall,x,(height-footing)/2,0,leg,height+footing,depth);
    p.box('stone',x,.21,0,leg+.19,.42,depth+.20);
    p.box('lintel',x,spring,0,leg+.2,.23,depth+.18);
    if(i===bays)break;
    spandrel(p,x+pitch/2,0,pitch-leg,depth,spring,rise,height,height,wall);
    for(const sign of [-1,1])p.at(x+pitch/2,0,sign*(depth/2+.014),sign===1?0:pi,()=>{
      arch(p,'stone',0,spring,0,r+.21,rise+.21,.23,.13);
      p.box('lintel',0,spring+rise+.08,.13,.28,.39,.15);
    });
  }
  p.box('lintel',0,height+.08,0,width+leg+.3,.22,depth+.42);
}

export function railing(p:Parts,length:number,stone=false) {
  const n=Math.max(1,Math.ceil(length/(stone?2.5:2.05)));
  p.box(stone?'lintel':'gold',0,1,0,length+.13,.11,.15);
  p.box(stone?'stone':'iron',0,.41,0,length,.06,.09);
  for(let i=0;i<=n;i++){
    const x=length*(i/n-.5);
    p.box(stone?'stone':'iron',x,.5,0,stone?.27:.10,1,stone?.30:.10);
    if(stone)p.box('lintel',x,1.05,0,.35,.13,.38);
  }
}

export function stairs(p:Parts,width:number,run:number,height:number) {
  const count=Math.max(4,Math.ceil(height/.32));
  for(let i=0;i<count;i++){
    const h=height*(count-i)/count;
    p.box(i%3===0?'chalk':'stone',0,h/2,run*(i+.5)/count,width,h,run/count+.015);
  }
  for(const side of [-1,1]){
    const x=side*(width/2+.07);
    p.rod('stone',p.vec(x,height+.44,0),p.vec(x,.44,run),.14);
    for(const t of [0,.5,1])p.box('stone',x,(1-t)*height+.28,t*run,.29,.63,.29);
  }
}

export function windowBay(p:Parts,x:number,y:number,w:number,h:number,lit:boolean,arched:boolean) {
  const r=w/2,rise=arched?Math.min(r*.75,h*.30):0,spring=y+h-rise;
  p.box('recess',x,y+(h-rise)/2,.035,w+.18,h-rise+.07,.1);
  const pane=lit?'honeyGlass':Math.cos(x*2.54+y)>.3?'seaGlass':'glass';
  p.box(pane,x,y+(h-rise)/2,.105,w-.16,h-rise-.1,.04);
  if(arched){
    const fan=new T.Shape();fan.moveTo(-r,0);fan.absellipse(0,0,r,rise,pi,0,true,0);fan.closePath();
    p.relief('glass',fan,.05,x,spring,.07);
    arch(p,'stone',x,spring,.11,r+.18,rise+.17,.19,.13);
    for(const t of [.25,.5,.75])p.rod('wood',p.vec(x,spring,.165),p.vec(x+r*.94*Math.cos(pi*t),spring+rise*.94*Math.sin(pi*t),.165),.035);
  }else p.box('lintel',x,y+h+.06,.15,w+.43,.16,.25);
  for(const side of [-1,1])p.box('stone',x+side*(r+.06),y+(h-rise)/2,.12,.15,h-rise,.17);
  const bars=w>1.8?3:2;
  for(let i=1;i<bars;i++)p.box('wood',x+w*(i/bars-.5),y+(h-rise)/2,.16,.073,h-rise,.08);
  if(w>1.8){
    p.box('bronze',x,spring,.19,w,.13,.10);
    for(const side of [-1,1])p.box('stone',x+side*(r+.10),spring,.19,.38,.22,.28);
  }
  for(const t of [.45,.78])p.box('iron',x,y+(h-rise)*t,.16,w,.055,.08);
  p.box('lintel',x,y-.03,.16,w+.4,.17,.33);
}

export function pavilion(p:Parts,w:number,d:number,floors:number,bays:number,wall:Pigment,cover:Pigment,phase=0) {
  const floor=2.5,h=floors*floor+.55;
  p.box(wall,0,h/2,0,w,h,d);
  around(p,w,d,(span,side)=>{
    const n=side%2?Math.max(2,Math.round(bays*d/w)):bays,pitch=span/n;
    p.box('stone',0,.20,.03,span+.11,.4,.19);
    for(let level=0;level<floors;level++){
      if(level)p.box('stone',0,level*floor+.13,.07,span+.2,.14,.25);
      for(let i=0;i<n;i++){
        const x=pitch*(i+.5)-span/2,door=side===0 && level===0 && i===Math.floor(n/2);
        windowBay(p,x,level*floor+(door?.20:.67),Math.min(pitch*.58,1.45),door?2.07:1.55,(i+side+phase+level*2)%7===0,level===floors-1||door);
        if(door)p.box('wood',x,.72,.205,.69,1.08,.09);
      }
    }
    for(const sign of [-1,1])for(let i=0;i<Math.ceil(h/.58);i++)
      p.box(i%2?'stone':'chalk',sign*(span/2-.16),.27+.58*i,.045,i%2?.4:.64,.48,.17);
    p.box('wood',0,h-.15,.1,span+.25,.18,.30);
  });
  roof(p,w+.7,d+.7,h,Math.min(2.3,d*.29),cover,.62);
  tileCourses(p,w+.7,d+.7,h,Math.min(2.3,d*.29),.62,cover!=='clay');
}

export function stack(p:Parts,height:number) {
  const shape=new T.CylinderGeometry(.46,.78,height,8).toNonIndexed();
  p.place(shape,'oxblood',new T.Matrix4().makeTranslation(0,height/2,0));shape.dispose();
  for(const y of [.6,height*.62,height-.68,height-.27])p.box('shade',0,y,0,y>height*.7?1.03:1.36,.16,y>height*.7?1.03:1.36);
  p.box('recess',0,height+.01,0,.58,.04,.58);
}

export function lantern(p:Parts,x:number,y:number,z:number) {
  p.mark('Monument lamp',x,y+1.78,z);
  p.box('iron',x,y+.8,z,.11,1.6,.11);p.box('gold',x,y+1.77,z,.3,.32,.3);
  p.box('lantern',x,y+1.78,z,.24,.25,.32);p.box('copper',x,y+1.99,z,.48,.13,.48);
}
