import { shopRoof, streetFront } from './river-shopfronts.js';
import * as T from 'three';
import { arch, chimneypot, foundation, lathe, roof, storey, tileCourses, type WindowStyle } from './architectural-parts.js';
import type { ModelTools, Pigment } from './model-workshop.js';
import type { RiverVenue } from './architecture-catalog.js';

type Pattern = Parameters<typeof storey>[5];
type Profile = readonly [width: number, depth: number, height: number, upperFloors: number, wall: Pigment, pattern: Pattern, window: WindowStyle];
const profiles: Record<RiverVenue, Profile> = {
  bakery: [3.7, 3, 1.65, 1, 'ochre', 'shutters', 'sash'],
  tearoom: [3.8, 2.8, 1.7, 1, 'sage', 'gallery', 'french'],
  cottages: [2.7, 2.7, 1.48, 1, 'chalk', 'shutters', 'sash'],
  pottery: [3.2, 3.1, 1.85, 0, 'plaster', 'industrial', 'factory'],
  bindery: [3.4, 2.9, 1.76, 1, 'oxblood', 'pilasters', 'oriel'],
  cooperage: [3.8, 3.2, 2.15, 0, 'ochre', 'industrial', 'factory'],
  atelier: [3.5, 3.1, 1.82, 2, 'chalk', 'gallery', 'french'],
  sailLoft: [4.4, 2.75, 1.9, 1, 'plaster', 'industrial', 'factory'],
  postOffice: [3.7, 3.1, 1.82, 1, 'oxblood', 'pilasters', 'paired'],
  boathouse: [3.1, 3.6, 1.64, 1, 'sage', 'gallery', 'french'],
  orangery: [3.2, 3, 1.5, 0, 'chalk', 'pilasters', 'paired'],
  clockmaker: [2.85, 2.8, 1.6, 2, 'ochre', 'pilasters', 'oriel'],
  library: [4.5, 3.3, 2.12, 1, 'chalk', 'pilasters', 'paired'],
  bathhouse: [4.3, 3.3, 1.94, 0, 'sage', 'pilasters', 'fanlight'],
  musicHall: [4.25, 3.15, 2.1, 1, 'oxblood', 'gallery', 'paired'],
  observatory: [3.5, 3.2, 1.82, 1, 'chalk', 'pilasters', 'fanlight']
};

const alternateWalls: Partial<Record<Pigment,Pigment>> = { ochre: 'plaster', plaster: 'ochre', sage: 'chalk', oxblood: 'plaster', chalk: 'sage' };

function vessel(p: ModelTools, x: number, z: number, size: number, color: Pigment = 'clay', y = .14) {
  lathe(p, color, x, y, z, [[.22,0],[.29,.09],[.39,.48],[.30,.65],[.24,.69],[.25,.75],[.19,.75],[.18,.65]].map(([r,h]) => [r! * size,h! * size]), 14);
}

function pergola(p: ModelTools, w: number, d: number, h: number, cloth?: Pigment) {
  for (const x of [-w/2, w/2]) for (const z of [-d/2, d/2]) {
    p.box('stone', x, .22, z, .23, .30, .23);
    p.box('wood', x, h/2, z, .13, h, .13);
    p.rod('wood', p.vec(x, h-.44, z), p.vec(x-Math.sign(x)*.34, h, z), .046);
  }
  for (const x of [-w/2,w/2]) p.box('wood', x, h, 0, .16,.16,d+.22);
  for (let i=0;i<7;i++) {
    const z=d*(i/6-.5);
    p.box('wood', 0,h+.09,z,w+.26,.11,.09);
    if (cloth) p.box(i%2 ? 'chalk' : cloth, 0,h+.16,z,w+.38,.065,d/6+.01);
  }
}

function shelves(p: ModelTools, books: boolean) {
  const pigments: Pigment[] = ['sage','clay','slate','ochre','oxblood'];
  for (const x of [-.82,.82]) p.box('wood',x,.81,0,.09,1.51,.52);
  for (let row=0;row<3;row++) {
    const y=.19+row*.47;
    p.box('wood',0,y,0,1.75,.075,.54);
    if (books) {
      for (let i=0;i<9;i++) {
        const x=(i-4)*.164,h=.24+((i*7+row)%4)*.046;
        p.box(pigments[(i+row)%5]!,x,y+.04+h/2,.03,.145,h,.32);
        p.box('gold',x,y+.13,.198,.098,.019,.015);
      }
    } else for (let i=-1;i<=1;i++) vessel(p,i*.51,0,.47,i===0?'sage':'clay',y+.045);
  }
}

function kiln(p: ModelTools, ceramic: boolean) {
  const profile=ceramic ? [[.88,0],[.94,.24],[.91,1.12],[.69,1.66],[.31,2.33],[.27,2.96],[.33,3.02],[.33,3.16],[.23,3.16]]
    : [[.95,0],[.99,.19],[.99,.72],[.85,1.12],[.55,1.38],[.25,1.46],[.23,2.07],[.31,2.09],[.31,2.19],[.20,2.19]];
  lathe(p, ceramic?'clay':'stone',0,.10,-.25,profile,24);
  for (const [r,h] of profile.slice(1,4)) lathe(p,'shade',0,.10+h!,-.25,[[r!+.014,0],[r!+.014,.042]]);
  p.box('recess',0,.45,.75,.58,.51,.07);
  arch(p,'lintel',0,.66,.69,.40,.29,.085,.10);
  for(const x of [-.34,.34])p.box('stone',x,.44,.76,.11,.47,.12);
  p.box('iron',0,.22,.88,.78,.08,.43);
}

function barrel(p: ModelTools, x: number, z: number, s: number) {
  const outline=[[.35,0],[.39,.10],[.45,.47],[.45,.62],[.39,1.0],[.35,1.08],[0,1.08]];
  lathe(p,'wood',x,.12,z,outline.map(([r,h])=>[r!*s,h!*s]),12);
  for(const [r,h] of [[.40,.14],[.456,.51],[.407,.92]])
    lathe(p,'iron',x,.12+h!*s,z,[[r!*s,0],[r!*s,.07*s]],12);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6, point=(r:number,h:number)=>p.vec(x+Math.sin(a)*r*s,.12+h*s,z+Math.cos(a)*r*s);
    p.rod('ochre',point(.355,.04),point(.452,.53),.012*s);
    p.rod('ochre',point(.452,.53),point(.358,1.06),.012*s);
  }
}

function glassVault(p:ModelTools,w:number,d:number,h:number,rise:number,glass:Pigment='seaGlass') {
  const bay=8;
  const point=(i:number,z:number)=>p.vec(Math.cos(Math.PI*i/bay)*w/2,h+Math.sin(Math.PI*i/bay)*rise,z);
  for(let i=0;i<bay;i++){
    const a=point(i,-d/2),b=point(i,d/2),c=point(i+1,-d/2),e=point(i+1,d/2);
    const panes=new T.BufferGeometry().setFromPoints([a,c,b,b,c,e,a,b,c,b,e,c]);
    panes.computeVertexNormals();p.place(panes,glass,new T.Matrix4());panes.dispose();
    p.rod('verdigris',a,b,.033);
    for(const z of [-d/2,-d/4,0,d/4,d/2])p.rod('copper',point(i,z),point(i+1,z),.052);
    for(const z of [-d/2,d/2]){
      const fan=new T.BufferGeometry().setFromPoints([point(i,z),point(i+1,z),p.vec(0,h,z),point(i+1,z),point(i,z),p.vec(0,h,z)]);
      fan.computeVertexNormals();p.place(fan,glass,new T.Matrix4());fan.dispose();
      p.rod('copper',p.vec(0,h,z),point(i,z),.032);
    }
  }
  for(const side of [-1,1])p.box('copper',side*w/2,h,0,.12,.14,d+.13);
}

function telescopeDome(p:ModelTools,r:number) {
  lathe(p,'stone',0,0,0,[[r*.90,0],[r,.13],[r,.29],[r*.95,.36]]);
  const skin=(start:number,sweep:number)=>{
    const profile=Array.from({length:12},(_,i)=>new T.Vector2(r*Math.cos(i*Math.PI/22),.33+r*Math.sin(i*Math.PI/22)));
    const dome=new T.LatheGeometry(profile,28,start,sweep).toNonIndexed();
    p.place(dome,'copper',new T.Matrix4());dome.dispose();
  };
  skin(.22,Math.PI*2-.44);
  for(let i=0;i<11;i++){
    const b=.33+r*Math.sin(i*Math.PI/22),top=.33+r*Math.sin((i+1)*Math.PI/22);
    for(const a of [.22,-.22,1.57,3.14,4.71]){
      const ring=r*Math.cos(i*Math.PI/22),next=r*Math.cos((i+1)*Math.PI/22);
      p.rod('seam',p.vec(ring*Math.sin(a),b,ring*Math.cos(a)),p.vec(next*Math.sin(a),top,next*Math.cos(a)),.025);
    }
  }
  p.rod('iron',p.vec(0,.53,.12),p.vec(0,1.04,r+.26),.15);
  p.rod('gold',p.vec(0,1.02,r+.20),p.vec(0,1.07,r+.34),.19);
}

function clockFace(p:ModelTools,x:number,y:number,z:number,r:number) {
  const dial=new T.Shape();dial.absarc(0,0,r,0,Math.PI*2,false);
  p.relief('gold',dial,.09,x,y,z);
  const face=new T.Shape();face.absarc(0,0,r*.88,0,Math.PI*2,false);
  p.relief('chalk',face,.025,x,y,z+.09);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,point=(f:number)=>p.vec(x+r*f*Math.sin(a),y+r*f*Math.cos(a),z+.127);
    p.rod('iron',point(.69),point(.81),.018);
  }
  p.clock(x,y,z+.15,r);
}

function studioEasel(p:ModelTools,x:number,z:number) {
  for(const side of [-1,1])p.rod('wood',p.vec(x+side*.46,.15,z+.12),p.vec(x+side*.12,1.64,z),.046);
  p.rod('wood',p.vec(x,.15,z-.45),p.vec(x,1.55,z),.045);
  p.box('wood',x,.64,z+.11,1.17,.10,.21);
  p.box('chalk',x,1.10,z+.08,1.05,.85,.06);
  const hill=new T.Shape();
  hill.moveTo(-.49,0);hill.lineTo(-.49,.17);hill.quadraticCurveTo(-.13,.49,.07,.28);
  hill.quadraticCurveTo(.25,.12,.49,.33);hill.lineTo(.49,0);hill.closePath();
  p.relief('sage',hill,.01,x,.72,z+.114);
}

function roofLantern(p:ModelTools,w:number,d:number,h:number,base:number){
  p.box('wood',0,base+.05,0,w+.15,.15,d+.13);
  p.box('seaGlass',0,base+h/2,0,w,h,d);
  for(const side of [-1,1]){
    for(let i=0;i<=4;i++)p.box('copper',(i/4-.5)*w,base+h/2,side*d/2,.055,h,.064);
    for(let i=0;i<=2;i++)p.box('copper',side*w/2,base+h/2,(i/2-.5)*d,.064,h,.055);
  }
  roof(p,w+.18,d+.17,base+h,.27,'copper',.55);
}

function rowboat(p:ModelTools) {
  const bow=new T.Shape();
  bow.moveTo(0,-1.51);bow.quadraticCurveTo(-.82,-.25,-.44,.99);
  bow.quadraticCurveTo(-.20,1.37,0,1.54);bow.quadraticCurveTo(.86,.69,.45,-.90);
  bow.quadraticCurveTo(.24,-1.24,0,-1.51);
  const inside=new T.Path();inside.moveTo(0,-1.29);inside.quadraticCurveTo(.64,-.19,.32,.91);
  inside.lineTo(0,1.26);inside.quadraticCurveTo(-.66,.51,-.32,-.86);inside.closePath();
  bow.holes.push(inside);
  const hull=new T.ExtrudeGeometry(bow,{depth:.25,bevelEnabled:true,bevelSize:.035,bevelThickness:.045,bevelSegments:2}).rotateX(-Math.PI/2);
  p.place(hull,'wood',new T.Matrix4().makeTranslation(0,.62,0));hull.dispose();
  for(const z of [-.70,0,.70]){
    p.box('ochre',0,.81,z,.81,.072,.19);
    p.box('wood',0,.48,z,1.11,.11,.15);
    for(const side of [-1,1])p.rod('wood',p.vec(side*.52,.13,z),p.vec(side*.33,.58,z),.065);
  }
  for(const side of [-1,1]){
    p.rod('ochre',p.vec(side*.65,.91,-1.19),p.vec(side*.69,1.12,1.19),.032);
    p.box('copper',side*.69,1.13,1.13,.14,.067,.46);
  }
}

const wings: Record<RiverVenue,(p:ModelTools)=>void> = {
  bakery(p) {
    kiln(p,false);
    p.box('wood',0,.58,1.12,1.63,.09,.47);
    for(const x of [-.63,.63])p.box('wood',x,.32,1.12,.10,.57,.32);
    for(const x of [-.48,0,.48]){
      lathe(p,'ochre',x,.63,1.12,[[.17,0],[.19,.055],[.14,.15],[.06,.19],[0,.19]],12);
      p.box('chalk',x,.80,1.12,.038,.03,.14);
    }
  },
  tearoom(p) {
    pergola(p,1.88,2.42,1.97,'sage');
    for(const z of [-.61,.60]){
      lathe(p,'iron',0,.14,z,[[.25,0],[.29,.055],[.07,.12],[.054,.54],[.17,.61]]);
      lathe(p,'chalk',0,.75,z,[[.39,0],[.40,.07],[0,.07]]);
      for(const x of [-.18,.15])vessel(p,x,z,.16,'sage',.82);
      for(const x of [-.67,.67]){
        p.box('wood',x,.42,z,.36,.11,.39);
        p.box('wood',x,.28,z,.12,.33,.16);
        p.box('sage',x+Math.sign(x)*.15,.62,z,.07,.40,.39);
      }
    }
  },
  cottages(p) {
    storey(p,2.05,2.30,1.53,'plaster','shutters',true);
    roof(p,2.30,2.53,1.55,.89,'clay',.94);
    tileCourses(p,2.30,2.53,1.55,.89,.94);
    chimneypot(p,-.59,1.94,-.51);
    for(const x of [-.72,.74]){
      vessel(p,x,1.23,.48);
      for(let i=0;i<5;i++){
        const u=x+Math.sin(i*2.4)*.19,h=.57+i*.084;
        p.rod('foliage',p.vec(x,.45,1.23),p.vec(u,h,1.24),.021);
        p.orb('oxblood',u,h,1.24,.086);
      }
    }
  },
  pottery(p) {
    kiln(p,true);
    p.face(0,()=>shelves(p,false),1.05);
    vessel(p,.91,.72,.56,'seaGlass');
  },
  bindery(p) {
    shelves(p,true);
    p.box('wood',0,.72,1.01,1.45,.14,.70);
    for(const x of [-.54,.54]){
      p.box('wood',x,.42,1.01,.14,.62,.46);
      p.box('iron',x,1.15,1.01,.09,.82,.10);
    }
    p.box('iron',0,1.52,1.01,1.26,.15,.19);
    p.box('wood',0,1.00,1.01,.92,.095,.54);
    for(let i=0;i<5;i++)lathe(p,'iron',0,1.04+i*.08,1.01,[[.09,0],[.11,.035],[.07,.065]],10);
    p.box('gold',0,1.65,1.01,.63,.055,.058);
    p.box('chalk',0,.865,1.02,.71,.13,.43);
  },
  cooperage(p) {
    pergola(p,1.96,2.50,2.14);
    barrel(p,-.47,-.62,1.08);barrel(p,.45,-.48,.97);barrel(p,-.42,.68,.82);
    for(let i=0;i<6;i++)p.rod('ochre',p.vec(.38+i*.064,.17,.90),p.vec(.51+i*.057,1.34,.64),.031);
  },
  atelier(p) {
    pergola(p,1.87,2.37,2.20);
    studioEasel(p,-.18,.52);
    for(let i=0;i<4;i++)p.box(i%2?'chalk':'ochre',-.58+i*.11,.57,-.56,.09,.88,1.02);
    vessel(p,.63,.55,.40,'sage');
  },
  sailLoft(p) {
    for(const x of [-.89,.89]){
      p.rod('wood',p.vec(x,.12,0),p.vec(x,3.38,0),.073);
      p.rod('iron',p.vec(x,.18,.94),p.vec(x,3.18,0),.018);
    }
    p.rod('wood',p.vec(-1.05,3.18,0),p.vec(1.05,3.04,0),.06);
    const sail=new T.Shape();
    sail.moveTo(-.77,2.98);sail.quadraticCurveTo(-.19,2.88,.76,2.87);
    sail.quadraticCurveTo(.45,1.75,-.69,.86);sail.quadraticCurveTo(-.55,1.90,-.77,2.98);
    p.relief('chalk',sail,.04,0,0,.06);
    for(let i=0;i<3;i++)p.rod('lintel',p.vec(-.65,1.43+i*.43,.11),p.vec(-.32+i*.30,1.50+i*.46,.11),.019);
    barrel(p,.49,.72,.65);
  },
  postOffice(p) {
    p.box('stone',0,.52,-.42,1.81,1.00,1.48);
    roof(p,2.04,1.72,1.05,.58,'slate');
    for(const x of [-.48,0,.48]){
      p.box('iron',x,.68,.334,.37,.35,.08);
      p.box('gold',x,.75,.38,.26,.046,.04);
    }
    lathe(p,'oxblood',.44,.13,.93,[[.28,0],[.29,.13],[.22,.18],[.22,.96],[.28,1.0],[.26,1.08],[.10,1.19],[0,1.19]]);
    p.box('recess',.44,.94,1.144,.21,.077,.035);
    p.box('gold',.44,.73,1.15,.13,.13,.025);
  },
  boathouse(p) {
    pergola(p,2.02,2.80,2.04);
    roof(p,2.31,3.09,2.19,.59,'slate',.83);
    rowboat(p);
  },
  orangery(p) {
    p.box('stone',0,.19,0,2.1,.23,2.56);
    for(const x of [-.92,.92])for(const z of [-1.10,0,1.10])
      p.box('copper',x,.84,z,.10,1.11,.12);
    glassVault(p,2.08,2.49,1.39,.80,'crystal');
    for(const z of [-.58,.60]){
      vessel(p,0,z,.59,'clay',.30);
      p.rod('wood',p.vec(0,.49,z),p.vec(0,1.36,z),.044);
      for(const x of [-.28,0,.27]){
        p.orb('foliage',x,1.23+(x===0?.18:0),z,.31);
        p.orb('ochre',x,1.19,z+.25,.085);
      }
    }
  },
  clockmaker(p) {
    const base=2.06;
    storey(p,1.82,1.96,base,'ochre','pilasters',true);
    p.box('wood',0,base+.57,0,1.42,1.19,1.42);
    for(let side=0;side<4;side++)p.face(side,()=>clockFace(p,0,base+.58,0,.48),.71);
    roof(p,1.78,1.78,base+1.20,1.05,'copper',.05);
    lathe(p,'gold',0,base+2.24,0,[[.07,0],[.12,.095],[.055,.22],[0,.42]]);
  },
  library(p) {
    lathe(p,'stone',0,0,-.19,[[1.02,0],[1.07,.25],[.95,.32],[.95,1.68],[1.06,1.73],[1.06,1.83]],12);
    for(let side=0;side<4;side++)p.face(side,()=>{
      p.box('seaGlass',0,1.02,0,.76,1.0,.095);
      arch(p,'lintel',0,1.31,.06,.43,.26,.065,.076);
      for(const x of [-.34,0,.34])p.box('wood',x,.99,.075,.041,.92,.055);
    },.78);
    lathe(p,'copper',0,1.82,-.19,[[1.10,0],[1.12,.07],[.54,.52],[.20,.66],[0,.69]],12);
    p.face(0,()=>shelves(p,true),1.13);
  },
  bathhouse(p) {
    for(const x of [-.48,.48]){
      lathe(p,'clay',x,.10,-.29,[[.39,0],[.41,.20],[.31,.28],[.25,2.43],[.34,2.49],[.34,2.63],[.23,2.63]],16);
      for(const h of [.76,1.49,2.16])lathe(p,'lintel',x,h,-.29,[[.31,0],[.31,.055]],16);
    }
    lathe(p,'stone',0,.15,.91,[[.56,0],[.60,.08],[.34,.15],[.34,.40],[.66,.56],[.68,.68],[.58,.68],[.48,.50]]);
    lathe(p,'seaGlass',0,.76,.91,[[.56,0],[0,.01]]);
    p.rod('copper',p.vec(0,.17,.29),p.vec(0,1.02,.29),.055);
    p.rod('copper',p.vec(0,1.02,.29),p.vec(0,1.02,.66),.055);
  },
  musicHall(p) {
    storey(p,2.02,2.50,2.20,'clay','pilasters',true,'fanlight');
    p.box('oxblood',0,3.06,-.22,1.78,1.76,1.91);
    for(const x of [-.73,.73])p.box('lintel',x,3.05,.76,.14,1.75,.12);
    roof(p,2.14,2.26,3.98,.53,'slate');
    for(const sign of [-1,1]){
      const pts=[[0,2.48],[.37,2.67],[.46,3.00],[.36,3.23],[.49,3.48]];
      for(let i=1;i<pts.length;i++)p.rod('gold',p.vec(sign*pts[i-1]![0]!,pts[i-1]![1]!,.79),p.vec(sign*pts[i]![0]!,pts[i]![1]!,.79),.053);
    }
    p.box('gold',0,3.34,.79,.85,.065,.075);
    for(let i=-2;i<=2;i++)p.rod('gold',p.vec(i*.125,2.58+Math.abs(i)*.05,.79),p.vec(i*.125,3.33,.79),.016);
  },
  observatory(p) {
    lathe(p,'stone',0,.09,0,[[1.08,0],[1.11,.14],[.96,.24],[.96,1.35],[1.10,1.41],[1.10,1.58]],16);
    const hub=p.vec(0,2.27,0);
    p.rod('iron',p.vec(0,1.58,0),hub,.12);
    for(const t of [-1,1])p.rod('gold',p.vec(0,2.28,t*.52),p.vec(0,2.69,t*.12),.041);
    p.rod('copper',p.vec(-.70,1.91,-.48),p.vec(.81,2.69,.57),.15);
    p.rod('gold',p.vec(.74,2.65,.51),p.vec(.89,2.74,.63),.20);
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5,b=(i+1)*Math.PI/5;
      const point=(angle:number,h:number)=>p.vec(Math.sin(angle)*1.05,h,Math.cos(angle)*1.05);
      p.rod('iron',point(a,1.64),point(a,2.10),.030);
      p.rod('gold',point(a,2.10),point(b,2.10),.032);
    }
  }
};

function crown(p:ModelTools,kind:RiverVenue,w:number,d:number,tall:boolean) {
  if (shopRoof(p,kind,w,d,tall)) return;
  if (kind==='orangery' || kind==='atelier' || kind==='observatory' || kind==='bathhouse') {
    p.box('stone',0,.04,0,w+.20,.14,d+.20);
    if(kind==='observatory'){
      telescopeDome(p,Math.min(w,d)*.46);
    } else if (kind==='bathhouse') {
      for (const side of [-1,1]) {
        const r=w*.225;
        lathe(p,'stone',side*w*.247,0,0,[[r,0],[r,.26],[r*1.05,.30]]);
        lathe(p,'copper',side*w*.247,.30,0,[[r*1.05,0],[r*.93,.26],[r*.65,.57],[r*.25,.76],[0,.84]],20);
        lathe(p,'gold',side*w*.247,1.09,0,[[.06,0],[.10,.06],[0,.21]]);
      }
    } else if(kind==='orangery') glassVault(p,w-.13,d-.14,.10,tall?1.32:.94);
    else {
      for(const sign of [-1,1]){
        const x=sign*w*.245;
        const section=new T.Shape();section.moveTo(-w*.25,0);section.lineTo(w*.14,.85);section.lineTo(w*.25,0);section.closePath();
        p.relief('zinc',section,d+.08,x,.08,-d*.5-.04);
        for(let i=-2;i<=2;i++){
          const z=i*d/5;
          p.rod('seaGlass',p.vec(x+w*.16,.74,z),p.vec(x+w*.25,.14,z),.125);
        }
      }
    }
    return;
  }
  const metal = ['postOffice','clockmaker','sailLoft','library','musicHall','boathouse'].includes(kind);
  const rise = tall ? 1.13 : .68, hip = tall ? .95 : .55;
  roof(p,w+.27,d+.26,.07,rise,metal?'slate':'clay',hip);
  tileCourses(p,w+.27,d+.26,.07,rise,hip,metal);
  if(kind==='library' || kind==='musicHall' || kind==='postOffice'){
    p.box('wood',0,rise*.73,0,w*.44,rise*.76,d*.32);
    roofLantern(p,w*.48,d*.39,kind==='musicHall'?.74:.49,rise+.09);
  } else {
    chimneypot(p,-w*.28,rise*.60,-d*.17);
  }
}

type Part = (key:string, draw:(p:ModelTools)=>void)=>T.Group;

function venueForm(kind:RiverVenue,elevation:number) {
  const [width,depth,height,upper,wall,pattern,window]=profiles[kind];
  const narrow=elevation%3===1, taller=elevation%3===2;
  const w=width*(narrow?.88:taller?.96:1.06);
  const floors=upper+(narrow?1:0);
  const alternate=elevation>=3;
  const mainX=alternate?1.07:-1.07;
  const wingX=mainX+(alternate?-1:1)*(w/2+1.04);
  const z=narrow?.34:taller?-.45:0;
  return { w,depth,height,wall,pattern,window,floors,alternate,taller,mainX,wingX,z };
}

export function buildRiverVenue(kind:RiverVenue,elevation:number,additions:number,part:Part) {
  const model=new T.Group();
  const { w,depth,height,wall,pattern,window,floors,alternate,taller,mainX,wingX,z } = venueForm(kind,elevation);
  function place(key:string, draw:(p:ModelTools)=>void,x:number,y:number,z:number) {
    const group=part('venue/'+key,draw);
    group.position.set(x,y,z);
    model.add(group);
    return group;
  }
  place('base/'+w+'/'+depth,p=>foundation(p,w,depth),mainX,0,0);
  const facade=alternate ? alternateWalls[wall] ?? wall : wall;
  const style=window==='oriel'?'sash':window;
  place([kind,w,facade,'ground'].join('/'),p=>{
    storey(p,w,depth,height,facade,pattern,true,style);
    streetFront(p,kind,w,depth,height);
    if (kind==='musicHall' || kind==='tearoom' || kind==='bakery') {
      const span=w*(kind==='musicHall'?.87:.68),reach=depth/2;
      p.box(kind==='musicHall'?'copper':'wood',0,height-.09,reach+.38,span,.13,.92);
      for(let i=0;i<9;i++){
        const x=(i-4)*span/9;
        if(kind==='musicHall')p.orb('lantern',x,height-.14,reach+.82,.048);
        else p.box(i%2?'chalk':kind==='tearoom'?'sage':'ochre',x,height-.16,reach+.82,span/9,.19,.055);
      }
      for(const x of [-span*.42,span*.42])p.rod('iron',p.vec(x,height-.58,reach),p.vec(x,height-.15,reach+.72),.036);
    }
  },mainX,0,0);
  for(let floor=0;floor<floors+additions;floor++){
    const unit=place([kind,w,facade,'upper',floor%2].join('/'),p=>
      storey(p,w,depth,1.48,facade,pattern,false,window,floor%2),mainX,height+floor*1.48,0);
    if(floor>=floors)unit.name='Room floor '+(floor-floors+1);
  }
  const roofY=height+(floors+additions)*1.48;
  place([kind,w,'roof',taller].join('/'),p=>crown(p,kind,w,depth,taller),mainX,roofY,0);
  place('wing-base',p=>foundation(p,2.22,3.04),wingX,0,z);
  place(kind+'/wing',wings[kind],wingX,0,z);
  return model;
}

const distantForms = {
  wall(p:ModelTools){p.box('stone',0,0,0,1,1,1);},
  stack(p:ModelTools){lathe(p,'clay',0,0,0,[[.5,0],[.42,.22],[.31,.86],[.36,.90],[.36,1],[0,1]],8);},
  gable(p:ModelTools){
    const end=new T.Shape();end.moveTo(-.5,0);end.lineTo(0,1);end.lineTo(.5,0);end.closePath();
    p.relief('slate',end,1,0,0,-.5);
  },
  dome(p:ModelTools){lathe(p,'copper',0,0,0,[[.5,0],[.50,.15],[.45,.48],[.34,.76],[.18,.94],[0,1]],10);},
  copperRoof(p:ModelTools){roof(p,1,1,0,1,'copper',.60);}
};
type DistantForm = keyof typeof distantForms;

const distantWings:Record<RiverVenue,readonly [DistantForm,number,number]> = {
  bakery:['dome',1.92,1.52],tearoom:['copperRoof',2.15,2.08],cottages:['gable',2.24,2.44],
  pottery:['stack',1.90,3.28],bindery:['wall',1.74,1.64],cooperage:['wall',1.73,1.10],
  atelier:['wall',1.17,1.57],sailLoft:['gable',1.98,3.20],postOffice:['gable',1.97,1.61],
  boathouse:['gable',2.30,2.78],orangery:['dome',2.08,2.19],clockmaker:['copperRoof',1.86,4.31],
  library:['dome',2.12,2.51],bathhouse:['stack',.69,2.73],musicHall:['gable',2.14,4.51],observatory:['wall',1.98,1.68]
};

export function buildVenueSkyline(kind:RiverVenue,elevation:number,additions:number,part:Part,windows?:T.Material) {
  const model=new T.Group();
  const {w,depth,height,floors,mainX,wingX,z,taller}=venueForm(kind,elevation);
  const eaves=height+(floors+additions)*1.48;
  function mass(form:DistantForm,x:number,y:number,offset:number,width:number,rise:number,length:number) {
    const unit=part('skyline/'+form,distantForms[form]);
    unit.position.set(x,form==='wall'?y+rise/2:y,offset);
    unit.scale.set(width,rise,length);model.add(unit);
    return unit;
  }
  const body=mass('wall',mainX,0,0,w,eaves,depth);
  if(windows)body.traverse(node=>{if(node instanceof T.Mesh)node.material=windows;});
  if(kind==='observatory' || kind==='orangery')mass('dome',mainX,eaves,0,w,kind==='orangery'?1.16:1.83,depth);
  else if(kind==='bathhouse'){
    for(const side of [-1,1])mass('dome',mainX+side*w*.25,eaves,0,w*.49,1.13,depth*.70);
  }else if(kind==='atelier'){
    for(const side of [-1,1])mass('gable',mainX+side*w*.25,eaves,0,w*.5,.90,depth);
  }else{
    const endOn=kind==='cottages'||kind==='bindery';
    const cap=mass(kind==='tearoom'?'copperRoof':'gable',mainX,eaves,0,endOn?w:depth,taller?1.2:.91,endOn?depth:w);
    if(!endOn)cap.rotation.y=Math.PI/2;
    if(kind==='bakery')mass('stack',mainX-w*.31,eaves,-depth*.23,.65,2.57,.64);
  }
  const [form,width,top]=distantWings[kind];
  const length=kind==='boathouse'||kind==='orangery'?2.74:width;
  if(kind==='bathhouse'){
    for(const side of [-1,1])mass(form,wingX+side*.48,0,z-.29,width,top,width);
  }else{
    const support=form==='wall'||form==='stack'?0:top*.64;
    if(support)mass('wall',wingX,0,z,width*.91,support,length*.94);
    mass(form,wingX,support,z,width,top-support,length);
  }
  return model;
}
