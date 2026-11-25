import * as T from 'three';
import { arch, lathe, roof } from './architectural-parts.js';
import { arcade, lantern, pavilion, railing, spandrel, stack, stairs, stoneArch, windowBay, type Parts } from './monument-masonry.js';
import type { Pigment } from './model-workshop.js';

const pi=Math.PI;
function timber(p:Parts,a:T.Vector3,b:T.Vector3,w:number,d=w,color:Pigment='wood') {
  const delta=b.clone().sub(a),shape=new T.BoxGeometry(1,1,1).toNonIndexed();
  const q=new T.Quaternion().setFromUnitVectors(p.vec(0,1,0),delta.clone().normalize());
  p.place(shape,color,new T.Matrix4().compose(a.clone().lerp(b,.5),q,p.vec(w,delta.length(),d)));shape.dispose();
}

function lodge(p:Parts,w:number,d:number,h:number) {
  for(const x of [-w/2,0,w/2])for(const z of [-d/2,d/2]){
    p.box('wood',x,h/2,z,.25,h,.25);
    p.rod('wood',p.vec(x,h-.95,z),p.vec(x+(x>0?-.72:.72),h,z),.09);
  }
  roof(p,w+.6,d+.7,h,.9,'clay',.93);
}

const landings=[
  [-16,0,11],[-7,3.2,9],[3,6.4,8],[13,9.9,4],[10,13.6,-2],[3,17.2,-7],[-9,21.2,-12]
] as const;

export function postOfficeSlope(x:number,z:number,natural:number) {
  let slope=natural;
  for(const [i,[lx,ly,lz]] of landings.entries()){
    const dx=Math.max(0,Math.abs(x-lx)-(i===6?7.7:3.65)),dz=Math.max(0,Math.abs(z-lz+1.8)-2.7);
    slope=Math.max(slope,ly+1.1-Math.hypot(dx,dz)*1.17);
  }
  const rise=slope-natural;
  const bedding=slope+.20*x-.11*z+.65*Math.sin(z*.34+x*.13);
  const ledge=1.05*Math.sin(bedding*1.85)+.32*Math.sin(bedding*3.7);
  slope+=T.MathUtils.smoothstep(rise,0,5)*(ledge+.80*Math.sin(x*.64+z*.24)*Math.cos(z*.52));
  for(const [i,[lx,ly,lz]] of landings.entries()){
    const dx=Math.abs(x-lx)-(i===6?9:4.3),dz=Math.abs(z-lz)-(i===6?4.1:2.8);
    const weight=1-T.MathUtils.smoothstep(Math.max(dx,dz),0,2.7);
    slope=T.MathUtils.lerp(slope,Math.min(slope,ly+.32),weight);
  }
  return slope;
}

function stairGallery(p:Parts,run:number,climb:number) {
  const bays=Math.max(2,Math.round(run/3.5)),pitch=run/bays,r=(pitch-.48)/2;
  for(let i=0;i<=bays;i++){
    const z=i*pitch,top=climb*(1-i/bays);
    p.box('shade',0,(top-16)/2,z,1.65,top+16,.5);
    if(i===bays)break;
    const next=climb*(1-(i+1)/bays),rise=Math.min(1.18,r),spring=next-rise-.31;
    p.at(0,0,z+pitch/2,-Math.PI/2,()=>{
      spandrel(p,0,0,2*r,1.6,spring,rise,top,next,'shade');
      for(const side of [-1,1])p.at(0,0,side*.81,side===1?0:Math.PI,()=>arch(p,'stone',0,spring,0,r+.1,rise+.1,.15,.1));
    });
  }
  const n=Math.ceil(climb/.26);
  for(let i=0;i<n;i++)p.box('stone',0,climb*(1-i/n)+.06,(i+.5)*run/n,1.88,.15,run/n+.04);
  for(const side of [-1,1]){
    p.rod('gold',p.vec(side*.88,climb+1.06,0),p.vec(side*.88,1.06,run),.058);
    for(let i=0;i<=bays;i++)p.box('iron',side*.88,climb*(1-i/bays)+.54,i*pitch,.1,1.03,.1);
  }
}

const cableStations=[new T.Vector3(-18,7.65,13.8),new T.Vector3(13,19.25,9.8),new T.Vector3(-10,30.15,-5.5)];

export function cablePoint(leg:number,side:number,t:number,out:T.Vector3) {
  out.copy(cableStations[leg]!).lerp(cableStations[leg+1]!,t);
  out.x+=side*.7;out.y-=1.3*Math.sin(pi*t);return out;
}

export function mailCrate(p:Parts){
  for(const sx of [-.4,.4])p.rod('iron',p.vec(0,0,0),p.vec(sx,-1.3,0),.042);
  p.box('ochre',0,-1.71,0,1.52,1.02,1.05);
  p.box('gold',0,-1.55,.55,.74,.40,.04);
  p.box('wood',0,-2.24,0,1.61,.16,1.14);
  for(const sx of [-.47,.47])p.box('wood',sx,-1.70,0,.12,1.01,1.12);
  p.box('wood',0,-1.30,0,1.34,.10,.96);
}

export function cliffPostOffice(p:Parts) {
  for(const [i,[x,y,z]] of landings.entries()){
    const summit=i===landings.length-1,w=summit?17.6:i===3?9.2:8,d=summit?8:5.4;
    p.at(x,y,z,0,()=>{
      const bays=summit?5:3,pitch=w/bays;
      arcade(p,w,d,bays,3.35,'shade');
      for(let pier=0;pier<=bays;pier++)p.box('shade',pitch*pier-w/2,-7,0,Math.min(1,pitch*.22),14.1,d-.08);
      p.box('shade',0,-1.4,-d*.28,w,3,d*.38);
      p.at(0,3.56,d/2+.25,0,()=>railing(p,w-1,true));
      const stationWidth=summit?12.9:i%2?4.8:5.3;
      p.at(summit?-1:-.8,3.55,-.45,0,()=>{
        if(i===0||i===4){
          lodge(p,stationWidth+1.1,3.95,3.3);
          p.box('plaster',-(stationWidth-2.1)/2,1.4,-.18,2.1,2.8,2.9);
          p.at(-(stationWidth-2.1)/2,0,1.29,0,()=>windowBay(p,0,.74,1.25,1.35,false,false));
          p.box('wood',1.25,.88,.81,2.4,.2,1.05);
          for(const sx of [.33,2.15])p.box('wood',sx,.41,.81,.16,.82,.78);
          for(const sx of [.77,1.32,1.87])p.box('chalk',sx,1.06,.87,.44,.15,.35);
        }else pavilion(p,stationWidth,summit?5.4:3.25,summit||i===3?2:1,summit?5:3,i%3===0?'plaster':'ochre',i===2?'clay':'copper',i);
      });
      p.at(w/2-1.2,3.55,.15,0,()=>lodge(p,2.8,2.7,2.35));
      lantern(p,-w/2+.4,3.5,d/2);
      const boxX=summit?5.1:1.72;
      p.box('oxblood',boxX,4.2,1.45,.60,1.15,.49);
      p.box('iron',boxX,4.52,1.715,.34,.09,.045);
      p.box('gold',boxX,4.03,1.71,.29,.24,.05);
      p.box('copper',boxX,4.82,1.45,.68,.13,.59);
      if(summit){
        p.at(-1,3.55,2.52,0,()=>{
          p.box('oxblood',0,2.85,0,4.6,5.7,.6);
          p.at(0,0,.31,0,()=>windowBay(p,0,.47,3.5,4.5,false,true));
          stoneArch(p,0,3.66,.19,1.97,1.52,.25,.3);
        });
        for(const dx of [-4.9,4.9]){
          p.box('oxblood',dx,7.65,2.37,.73,2.65,.16);
          p.box('gold',dx,8.82,2.48,.66,.10,.10);
          p.rod('gold',p.vec(dx-.21,7.65,2.49),p.vec(dx,7.45,2.49),.035);
          p.rod('gold',p.vec(dx,7.45,2.49),p.vec(dx+.21,7.65,2.49),.035);
        }
        p.at(4,3.52,-1.7,0,()=>stack(p,9.6));
        p.at(-4.4,9.09,.6,0,()=>{
          p.box('plaster',0,.48,0,1.45,.95,1.7);
          windowBay(p,0,.18,.73,.75,false,true);
          roof(p,1.68,1.98,1.02,.65,'copper',.45);
        });
      }
    });
    if(i>0){
      const [lx,ly,lz]=landings[i-1]!;
      const high=p.vec(x,y+3.54,z+d/2+.92),low=p.vec(lx,ly+3.54,lz+3.55);
      const delta=low.clone().sub(high),run=Math.hypot(delta.x,delta.z);
      p.at(high.x,low.y,high.z,Math.atan2(delta.x,delta.z),()=>stairGallery(p,run,high.y-low.y));
    }
  }
  const stations=cableStations;
  for(const point of stations){
    p.box('wood',point.x,point.y-2.78,point.z-1.7,.38,5.56,.38);
    p.box('wood',point.x,point.y-.36,point.z-.76,.40,.40,2.57);
    p.rod('wood',point.clone().add(p.vec(0,-3.1,-1.7)),point.clone().add(p.vec(0,-.47,.16)),.18);
    p.box('iron',point.x,point.y,point.z,2.12,.23,.32);
  }
  for(let i=1;i<stations.length;i++){
    for(const dx of [-.7,.7]){
      const point=(t:number)=>cablePoint(i-1,Math.sign(dx),t,p.vec(0,0,0));
      for(let j=0;j<10;j++)p.rod('iron',point(j/10),point((j+1)/10),.052);

    }
  }
}

function founderBell(p:Parts) {
  lathe(p,'gold',0,0,0,[[.05,8.7],[1.4,8.64],[2.4,7.85],[2.67,6.8],[2.85,4.25],[3.42,2.55],[4.43,.92],[5.02,.44],[5.1,0],[4.7,-.17],[4.38,.30],[3.04,2.18],[2.51,4.26],[2.2,7.15],[.05,8.15]],48);
  lathe(p,'bronze',0,0,0,[[4.91,.46],[4.36,.99],[3.36,2.63],[2.85,4.28],[2.69,6.7],[2.42,7.88],[1.46,8.66]],48);
  for(const [y,r] of [[.30,5.07],[.93,4.45],[1.32,4.13],[6.55,2.74],[7.23,2.65],[7.53,2.57]] as const)
    lathe(p,'gold',0,y,0,[[r-.04,0],[r+.09,.07],[r,.17]],48);
  for(let i=0;i<28;i++){
    const a=2*pi*i/28;
    p.at(2.72*Math.sin(a),6.9,2.72*Math.cos(a),a,()=>{
      p.rod('gold',p.vec(-.15,.08,0),p.vec(0,-.13,0),.04);
      p.rod('gold',p.vec(0,-.13,0),p.vec(.15,.08,0),.04);
    });
  }
  p.rod('iron',p.vec(0,7.4,0),p.vec(.36,-.96,0),.20);p.orb('gold',.36,-1.26,0,.72);
  for(const x of [-.84,0,.84]){arch(p,'gold',x,8.6,-.25,.61,.89,.21,.5);}
  p.box('wood',0,9.62,0,6,.9,1.2);
  p.at(3.11,9.62,0,pi/2,()=>{
    const rim=new T.TorusGeometry(1.7,.13,6,28).toNonIndexed();p.place(rim,'wood',new T.Matrix4());rim.dispose();
    for(let i=0;i<6;i++)p.rod('wood',p.vec(0,0,0),p.vec(1.7*Math.cos(i*pi/3),1.7*Math.sin(i*pi/3),0),.10);
    p.rod('wood',p.vec(1.67,0,0),p.vec(2.28,-8.63,0),.059);
  });
  for(const x of [-2,2])p.box('iron',x,9.62,0,.38,1,1.26);
}

export function bellYard(p:Parts) {
  const yard=new T.CylinderGeometry(18.2,16.7,5,20).toNonIndexed();
  p.place(yard,'shade',new T.Matrix4().makeScale(1,1,.75).setPosition(0,-.1,0));yard.dispose();
  const lip=new T.CylinderGeometry(18.5,18.5,.35,20).toNonIndexed();
  p.place(lip,'stone',new T.Matrix4().makeScale(1,1,.75).setPosition(0,2.56,0));lip.dispose();
  p.at(0,2.73,0,0,()=>{
    for(const z of [-6.4,0,6.4]){
      for(const sx of [-1,1]){
        const x=sx*7;
        p.box('stone',x,.8,z,1.51,1.60,1.52);p.box('lintel',x,1.66,z,1.66,.20,1.67);
        p.box('wood',x,7.2,z,.82,11.4,.91);
        for(const y of [2.1,11.9])p.box('iron',x,y,z,.9,.21,.99);
        timber(p,p.vec(x,9.05,z),p.vec(sx*3.76,12.78,z),.52);
        timber(p,p.vec(x,12.95,z),p.vec(0,17.5,z),.51);
        timber(p,p.vec(sx*4,13.08,z),p.vec(sx*2,16.2,z),.30);
        if(z!==6.4)timber(p,p.vec(x,10,z),p.vec(x,12.83,z+2.4),.35);
        p.orb('gold',x,12.54,z+.5,.14);
      }
      p.box('wood',0,12.85,z,15,.68,.8);p.box('wood',0,15.12,z,.38,4.13,.40);
    }
    for(const x of [-7,7])p.box('wood',x,13.15,0,.75,.54,14.7);
    for(const side of [-1,1]){
      const at=(u:number,z:number)=>p.vec(side*8.8*u,18.14-4.82*u,z);
      const a=at(0,-8.25),b=at(1,-8.25),c=at(1,8.25),d=at(0,8.25);
      const pitch=new T.BufferGeometry().setFromPoints(side===1?[a,c,b,a,d,c,b,c,a,c,d,a]:[a,b,c,a,c,d,c,b,a,d,c,a]);
      pitch.computeVertexNormals();p.place(pitch,'clay',new T.Matrix4());pitch.dispose();
      for(let u=1;u<=18;u++)p.rod(u%4===0?'oxblood':'clay',at(u/18,-8.27),at(u/18,8.27),.055);
      for(let j=-8;j<=8;j+=1.03)timber(p,at(0,j).add(p.vec(0,-.19,0)),at(1,j).add(p.vec(0,-.19,0)),.16,.21);
      for(const z of [-8.25,8.25])timber(p,at(0,z),at(1,z),.29,.35);
    }
    p.box('copper',0,18.22,0,.39,.28,17);
    for(const z of [-8.3,8.3]){p.box('stone',0,18.48,z,.36,.52,.38);p.orb('gold',0,18.85,z,.22);}
    p.at(0,3.39,.7,0,()=>founderBell(p));
    p.at(-11.1,0,-4,pi/2,()=>pavilion(p,7.6,4.7,2,3,'oxblood','copper',2));
    p.at(-12.2,0,-6,0,()=>stack(p,12.1));
    p.at(11.6,0,-2,-pi/2,()=>arcade(p,10.3,3.1,5,3.6,'shade'));
    for(const x of [-10.5,10.5])p.at(x,.04,5,0,()=>{
      for(const dx of [-1,1])for(const dz of [-.55,.55])timber(p,p.vec(dx*1.4,0,dz),p.vec(dx,2,0),.17);
      p.box('wood',0,2.03,0,3.15,.25,.3);
      lathe(p,'gold',0,.67,0,[[.69,0],[.73,.1],[.46,.42],[.32,1.06],[.08,1.15]],20);
    });
    for(let i=0;i<20;i++){
      if(i===4||i===5)continue;
      const a=2*pi*i/20,b=2*pi*(i+1)/20;
      const x=17.3*(Math.cos(a)+Math.cos(b))/2,z=12.85*(Math.sin(a)+Math.sin(b))/2;
      const dx=17.3*(Math.cos(b)-Math.cos(a)),dz=12.85*(Math.sin(b)-Math.sin(a));
      p.at(x,0,z,-Math.atan2(dz,dx),()=>railing(p,Math.hypot(dx,dz),true));
    }
    for(const x of [-3.4,3.4])lantern(p,x,0,12.4);
  });
  p.at(0,-1.6,12.1,0,()=>stairs(p,4.5,7.8,4.32));
  for(const side of [-1,1]){
    for(let j=0;j<7;j++){
      const a=(j+.3)*pi/15,b=(j+1.3)*pi/15;
      const x=side*17.2*(Math.cos(a)+Math.cos(b))/2,z=15.3*(Math.sin(a)+Math.sin(b))/2;
      const dx=side*17.2*(Math.cos(b)-Math.cos(a)),dz=15.3*(Math.sin(b)-Math.sin(a));
      p.at(x,-1,z,-Math.atan2(dz,dx),()=>{
        p.box('shade',0,-.6,0,Math.hypot(dx,dz)+.22,2.4,1.65);
        p.box('stone',0,.67,0,Math.hypot(dx,dz)+.25,.17,1.9);
      });
    }
  }
}

export function tideOrgan(p:Parts) {
  p.at(0,-3,1.6,0,()=>arcade(p,28,8.7,7,6.2,'oxblood',4));
  p.at(0,3.37,-.65,0,()=>pavilion(p,27,8.2,2,10,'oxblood','copper',2));
  p.at(0,3.38,4.6,0,()=>{
    p.box('plaster',0,2.95,0,21.2,5.9,2.7);
    p.at(0,0,1.36,0,()=>{
      for(let i=0;i<7;i++)windowBay(p,(i-3)*2.92,.6,2.12,4.65,i%3===0,true);
      for(const x of [-10.3,10.3])p.box('stone',x,2.9,.1,.5,5.8,.52);
      p.box('lintel',0,5.87,.08,21.6,.33,.73);
    });
    roof(p,21.9,3.45,6.08,.82,'copper',.95);
  });
  for(const x of [-14.2,14.2])p.at(x,1.1,2.4,0,()=>{
    pavilion(p,3.55,4.35,x<0?3:4,2,'plaster','copper',3);
    p.box('stone',0,.05,0,4.2,.35,4.8);
  });
  const count=18;
  for(let i=0;i<count;i++){
    const t=i/(count-1),x=-13.6+2.27*i-.032*i*i,h=3.1+20*Math.pow(1-t,1.72),w=2.07-1.13*t,z=-2.9;
    p.at(x,8.6,z,0,()=>{
      const width=w*.5,depth=w*.74;
      for(const side of [-1,1]){
        p.box(i%3===0?'verdigris':'copper',side*(width-.052),h/2,0,.105,h,depth*2);
        p.box(i%4===0?'seam':'copper',0,h/2,side*(depth-.052),w-.20,h,.105);
        p.box('gold',side*width,h/2,depth+.012,.043,h,.043);
        p.box('gold',side*width,h-.04,0,.12,.19,2*depth+.17);
      }
      for(const sign of [-1,1])p.box('gold',0,h-.04,sign*depth,w+.12,.19,.12);
      p.box('recess',0,h-.73,0,w-.11,.06,depth*2-.1);
      p.box('iron',0,h-.88,depth+.065,w-.17,.5,.15);
      p.box('gold',0,h-1.12,depth+.16,w-.07,.13,.21);
      for(let y=2;y<h-1.5;y+=3.1)p.box('seam',0,y,0,w+.065,.1,depth*2+.06);
      const spring=2.8+2.5*(1-t);
      timber(p,p.vec(0,-1.1,4.6),p.vec(0,spring,depth),w*.88,.83,'oxblood');
      p.box('stone',0,spring,depth+.18,w*1.04,.34,1.0);
      for(const side of [-1,1])p.rod('seam',p.vec(side*width*.79,1,depth+.14),p.vec(side*width*.79,h-.21,depth+.14),.042);
    });
  }
}
