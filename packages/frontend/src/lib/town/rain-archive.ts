import * as T from 'three';
import { arch, lathe } from './architectural-parts.js';
import { lantern, railing, spandrel, stairs, type Parts } from './monument-masonry.js';
import type { Pigment } from './model-workshop.js';

const floor=2, throat=1.12;
export const archiveBasin={radius:4.3,waterline:floor+.22};
export const archiveRoof = { halfSpan: 22.2, halfDepth: 16.4, outlet: 13.5, rise: 4.8, backRise: 2.6 };
const angleStep=Math.PI/20, entranceWidth=4.8, stepsStart=16, stepsRun=5.5;
export const archiveEntryZ=stepsStart+stepsRun;
const terrace={halfSpan:22.2,halfDepth:18.1};

export const archiveShelter={functionName:'archiveExposure',source:`
  float archiveExposure(vec3 local){
    vec2 rim=local.xz/vec2(${archiveRoof.halfSpan},${archiveRoof.halfDepth});
    float radius=length(rim);
    float distanceToCenter=length(local.xz);
    float outer=distanceToCenter/max(.001,radius);
    float t=clamp((distanceToCenter-${throat})/max(1.,outer-${throat}),0.,1.);
    float back=-local.z/mix(${throat},${archiveRoof.halfDepth},t);
    float roof=${archiveRoof.outlet}+(${archiveRoof.rise}+${archiveRoof.backRise}*back)*t*(.48+.52*t);
    return max(smoothstep(.98,1.01,radius),smoothstep(roof-.60,roof-.25,local.y));
  }
`};

export function archiveGroundHeight(x:number,z:number,natural:number){
  const edge=(Math.hypot(x/terrace.halfSpan,z/terrace.halfDepth)-1)*terrace.halfDepth;
  const platform=1-T.MathUtils.smootherstep(edge,-1.5,9.5);
  const sides=1-T.MathUtils.smootherstep(Math.abs(x),entranceWidth/2+.75,entranceWidth/2+9);
  const approach=sides*T.MathUtils.smootherstep(z,stepsStart-2,stepsStart+1)*
    (1-T.MathUtils.smootherstep(z,archiveEntryZ+.55,archiveEntryZ+10.5));
  return T.MathUtils.lerp(natural,-.12,1-(1-platform)*(1-approach));
}
const roofRings=[0,.18,.44,.72,1];
const books:readonly Pigment[]=['oxblood','sage','ochre','wood','slate','plaster'];

function ellipse(a:number,x:number,z:number,y:number){
  return new T.Vector3(x*Math.sin(a),y,-z*Math.cos(a));
}

function roofPoint(a:number,t:number){
  const {halfSpan,halfDepth,outlet,rise,backRise}=archiveRoof;
  return ellipse(a,T.MathUtils.lerp(throat,halfSpan,t),T.MathUtils.lerp(throat,halfDepth,t),
    outlet+(rise+backRise*Math.cos(a))*t*(.48+.52*t));
}

function roofPanel(a:number,b:number) {
  const faces: T.Vector3[]=[];
  for(let j=1;j<roofRings.length;j++){
    const inner=roofRings[j-1]!,outer=roofRings[j]!;
    const v=roofPoint(a,inner),w=roofPoint(b,inner),x=roofPoint(b,outer),y=roofPoint(a,outer);
    faces.push(v,w,y,w,x,y);
  }
  return faces;
}

function readingBay(p:Parts,width:number,index:number,level:number){
  p.box('recess',0,1.87,-3.22,width+.2,3.75,.46);
  p.box('wood',0,1.9,-2.93,width-.43,3.18,.32);
  const bookWidth=(width-.98)/10;
  for(let shelf=0;shelf<3;shelf++){
    const y=.53+.89*shelf;
    p.box('ochre',0,y,-2.62,width-.66,.11,.68);
    for(let j=0;j<10;j++){
      const n=7*index+3*shelf+j+level, h=.41+.095*(n%4);
      p.box(books[n%books.length]!,bookWidth*(j-4.5),y+.06+h/2,-2.69,bookWidth*.82,h,.32);
    }
  }
  for(const sign of [-1,1]){
    p.box('stone',sign*width/2,1.58,0,.43,3.16,.65);
    p.box('lintel',sign*width/2,2.57,0,.67,.23,.85);
  }
  const radius=(width-.4)/2;
  spandrel(p,0,0,width-.4,.63,2.57,1.21,4.15,4.15,'oxblood');
  arch(p,'chalk',0,2.57,.32,radius+.12,1.36,.20,.12);
  p.box('lintel',0,3.87,.39,.32,.40,.25);
  if(index%3===1){
    p.rod('bronze',p.vec(0,3.80,-.10),p.vec(0,3.45,-.76),.055);
    p.box('lantern',0,3.26,-.76,.40,.39,.40);
    p.box('copper',0,3.50,-.76,.55,.12,.55);
    p.mark('Monument lamp',0,3.25,-.76);
  }
  if(level)p.at(0,0,.85,0,()=>railing(p,width));
  if((index+level)%3===1){
    p.box('wood',0,.92,-1.02,1.75,.13,.82);
    for(const x of [-.67,.67])p.box('iron',x,.44,-1.02,.12,.88,.48);
    p.box('chalk',.31,1.02,-1.01,.43,.06,.31);
    p.box('wood',-.4,.48,-.21,.58,.13,.54);
    p.box('iron',-.4,.24,-.21,.16,.48,.18);
  }
}

export function rainArchive(p:Parts){
  const stoneDrum=new T.CylinderGeometry(1,1,1,64).toNonIndexed();
  const drum=(color:Pigment,x:number,z:number,y:number,height:number)=>{
    p.place(stoneDrum,color,new T.Matrix4().makeScale(x,height,z).setPosition(0,y,0));
  };
  drum('oxblood',terrace.halfSpan,terrace.halfDepth,-3.4,7.8);
  drum('lintel',terrace.halfSpan+.15,terrace.halfDepth+.12,.53,.18);
  drum('oxblood',21.1,16.2,1.18,1.24);
  drum('stone',21.45,16.55,1.72,.36);
  drum('chalk',21.25,16.35,1.94,.12);
  stoneDrum.dispose();
  p.box('shade',0,-.31,stepsStart+stepsRun/2,entranceWidth,.64,stepsRun);
  p.box('stone',0,-.14,archiveEntryZ+.26,entranceWidth+.35,.29,.62);
  p.at(0,0,stepsStart,0,()=>stairs(p,entranceWidth,stepsRun,floor));
  const poolRadius=archiveBasin.radius;
  lathe(p,'bronze',0,floor,0,[[poolRadius-.25,0],[poolRadius+.38,0],[poolRadius+.42,.21],[poolRadius+.15,.39],[poolRadius,.33],[poolRadius-.12,.12]],56);

  const bays=13, arc=Math.PI*.64;
  for(let i=0;i<bays;i++){
    const a=ellipse(-arc+2*arc*i/bays,17.4,11.75,0),b=ellipse(-arc+2*arc*(i+1)/bays,17.4,11.75,0);
    const mid=a.clone().lerp(b,.5),width=a.distanceTo(b),yaw=-Math.atan2(b.z-a.z,b.x-a.x);
    for(let level=0;level<3;level++){
      p.at(mid.x,floor+4.15*level,mid.z,yaw,()=>{
        p.box('stone',0,-.16,-.97,width+1.0,.31,4.4);
        readingBay(p,width,i,level);
      });
    }
    const angle=-arc+2*arc*i/bays,top=roofPoint(angle,.84);
    p.rod('bronze',p.vec(a.x,floor+12.36,a.z),top,.21);
  }
  for(const side of [-1,1]){
    const start=Math.PI*.65, end=Math.PI-Math.asin((entranceWidth/2+.25)/20.6);
    for(let i=0;i<7;i++){
      const a=side*T.MathUtils.lerp(start,end,i/7),b=side*T.MathUtils.lerp(start,end,(i+1)/7);
      const left=ellipse(a,20.6,15.8,floor),right=ellipse(b,20.6,15.8,floor);
      const mid=left.clone().lerp(right,.5);
      p.at(mid.x,floor,mid.z,-Math.atan2(right.z-left.z,right.x-left.x),()=>railing(p,left.distanceTo(right),true));
    }
    for(let i=0;i<5;i++){
      const a=side*(2.04+i*.177),bed=ellipse(a,18.6,14.2,floor);
      const tangent=-Math.atan2(14.2*Math.sin(a),18.6*Math.cos(a));
      p.at(bed.x,floor,bed.z,tangent,()=>{
        p.box('oxblood',0,.22,0,2.85,.44,1.16);
        p.box('stone',0,.46,0,3.06,.16,1.38);
        p.box('foliage',0,.55,0,2.80,.12,1.13);
        for(let j=0;j<7;j++){
          const x=(j-3)*.38,z=Math.sin(i*1.8+j)*.29;
          p.orb('foliage',x,.70,z,.26+.05*Math.cos(j+i));
          p.orb(j%3?'chalk':'ochre',x+.08,.86,z+.07,.12);
        }
      });
    }
    for(const [x,z] of [[7.7,7.8],[12.2,4.7]] as const){
      p.at(side*x,floor,z,-side*.5,()=>{
        p.box('bronze',0,.52,0,.24,1.04,.34);
        p.box('wood',0,1.08,0,2.3,.13,1.16);
        p.box('oxblood',.35,1.19,-.10,.57,.08,.41);
        p.box('chalk',.36,1.24,-.10,.52,.03,.37);
        for(const seat of [-1,1]){
          p.box('wood',seat*.45,.50,seat*.95,.70,.13,.60);
          for(const leg of [-1,1])p.box('iron',seat*.45+leg*.23,.23,seat*.95,.09,.46,.49);
          p.box('wood',seat*.45,.85,seat*1.24,.7,.58,.09);
        }
      });
    }
    for(const [x,z] of [[6.4,12.8],[14.9,5.5]] as const)lantern(p,side*x,floor,z);
  }

  for(let i=0;i<40;i++){
    const a=i*angleStep,b=(i+1)*angleStep,faces=roofPanel(a,b);
    for(let j=1;j<roofRings.length;j++){
      p.rod(i%4===0?'gold':'seam',roofPoint(a,roofRings[j-1]!),roofPoint(a,roofRings[j]!),i%4===0?.095:.055);
    }
    const panel=new T.BufferGeometry().setFromPoints(faces);
    panel.computeVertexNormals();
    p.place(panel,i%5===2?'seam':'copper',new T.Matrix4());
    faces.reverse();
    const underside=new T.BufferGeometry().setFromPoints(faces);underside.computeVertexNormals();
    p.place(underside,'bronze',new T.Matrix4().makeTranslation(0,-.13,0));
    panel.dispose();underside.dispose();
    p.rod('gold',roofPoint(a,1),roofPoint(b,1),.14);
    p.rod('gold',roofPoint(a,0),roofPoint(b,0),.13);
  }
}
