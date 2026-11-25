import * as T from 'three';
import { arch, lathe, roof, tileCourses } from './architectural-parts.js';
import type { ModelTools, Pigment } from './model-workshop.js';
import type { RiverVenue } from './architecture-catalog.js';

function steppedGable(p:ModelTools,span:number,rise:number) {
  const outline=new T.Shape();
  outline.moveTo(-span/2,0);
  for(let i=0;i<7;i++){
    const x=span*(i/7-.5),h=.25+rise*(1-Math.abs(i-3)/3);
    outline.lineTo(x,h);
    outline.lineTo(x+span/7,h);
    p.box('lintel',x+span/14,h+.035,0,span/7+.06,.085,.21);
  }
  outline.lineTo(span/2,0);outline.closePath();
  p.relief('oxblood',outline,.14,0,0,-.08);
  const book=new T.Shape();book.moveTo(0,0);book.quadraticCurveTo(-.16,.10,-.35,.07);
  book.lineTo(-.35,.38);book.quadraticCurveTo(-.12,.42,0,.29);book.quadraticCurveTo(.15,.41,.35,.38);
  book.lineTo(.35,.07);book.quadraticCurveTo(.16,.10,0,0);
  p.relief('lintel',book,.06,0,.24,.08);
  p.box('gold',0,.40,.15,.027,.25,.027);
}

function dormer(p:ModelTools,x:number,z:number) {
  p.box('wood',x,.61,z,.80,.61,.58);
  p.box('seaGlass',x,.64,z+.30,.60,.40,.045);
  for(const dx of [-.28,0,.28])p.box('chalk',x+dx,.64,z+.34,.043,.43,.048);
  p.box('chalk',x,.63,z+.34,.60,.041,.048);
  const gable=new T.Shape();gable.moveTo(-.53,0);gable.lineTo(0,.38);gable.lineTo(.53,0);gable.closePath();
  p.relief('slate',gable,.89,x,.91,z-.49);
  for(const side of [-1,1])p.rod('lintel',p.vec(x+side*.53,.92,z+.42),p.vec(x,1.29,z+.42),.042);
}

export function shopRoof(p:ModelTools,kind:RiverVenue,w:number,d:number,high:boolean) {
  const ridge=high?1.44:1.10;
  switch(kind){
    case 'bindery':
    case 'cottages': {
      p.face(1,()=>{
        roof(p,d+.21,w+.23,.045,ridge,'clay',.98);
        tileCourses(p,d+.21,w+.23,.045,ridge,.98);
      },0);
      if(kind==='bindery'){
        for(const side of [0,2])p.face(side,()=>steppedGable(p,w+.22,ridge+.09),d/2+.13);
      }else{
        p.face(0,()=>{
          for(const side of [-1,1])p.rod('chalk',p.vec(side*w*.52,.04,0),p.vec(0,ridge+.06,0),.069);
          p.rod('wood',p.vec(0,.10,.03),p.vec(0,ridge,.03),.072);
          p.box('wood',0,.40,.02,w*.68,.105,.10);
        },d/2+.09);
        p.box('stone',w*.32,.74,-d*.23,.46,1.49,.50);
        p.box('clay',w*.32,1.46,-d*.23,.55,.15,.59);
      }
      return true;
    }
    case 'bakery': {
      roof(p,w+.27,d+.24,.05,ridge,'clay',.80);
      tileCourses(p,w+.27,d+.24,.05,ridge,.80);
      for(const x of [-w*.27,w*.27])dormer(p,x,d*.30);
      const x=-w*.31,z=-d*.23;
      p.box('clay',x,1.09,z,.61,2.20,.59);
      for(const y of [.85,1.54,2.13])p.box('lintel',x,y,z,.70,.095,.69);
      for(const dx of [-.15,.15])lathe(p,'oxblood',x+dx,2.16,z,[[.12,0],[.13,.28],[.16,.31],[.16,.41],[.096,.41]]);
      return true;
    }
    case 'tearoom': {
      roof(p,w+.48,d+.50,.04,.62,'copper',.61);
      tileCourses(p,w+.48,d+.50,.04,.62,.61,true);
      p.box('ochre',0,.68,0,w*.63,.36,d*.43);
      for(const side of [-1,1])for(let i=-2;i<=2;i++)
        p.box('seaGlass',i*w*.115,.73,side*d*.22,w*.088,.18,.042);
      roof(p,w*.76,d*.57,.87,high?.77:.51,'copper',.50);
      for(const side of [-1,1])p.orb('gold',side*w*.18,high?1.69:1.43,0,.095);
      return true;
    }
    case 'cooperage':
    case 'sailLoft': {
      roof(p,w+.24,d+.28,.05,ridge,'slate',.93);
      tileCourses(p,w+.24,d+.28,.05,ridge,.93,true);
      const housing=new T.Shape();housing.moveTo(-.68,0);housing.lineTo(-.68,.74);
      housing.lineTo(0,1.20);housing.lineTo(.68,.74);housing.lineTo(.68,0);housing.closePath();
      const front=d/2+.10;
      p.relief('wood',housing,front+.12,0,.045,-.04);
      p.box('recess',0,.49,front+.19,.84,.77,.045);
      for(const x of [-.47,.47])p.box('ochre',x,.52,front+.21,.09,.87,.08);
      p.box('wood',0,.91,front+.43,.15,.16,.77);
      p.rod('iron',p.vec(0,.89,front+.72),p.vec(0,.08,front+.72),.028);
      p.orb('gold',0,.08,front+.72,.071);
      for(const side of [-1,1])p.rod('lintel',p.vec(side*.73,.79,front+.19),p.vec(0,1.28,front+.19),.058);
      if(kind==='cooperage'){
        for(const x of [-w*.31,w*.31]){
          lathe(p,'zinc',x,ridge*.88,0,[[.21,0],[.18,.45],[.33,.51],[.33,.57],[0,.73]],12);
        }
      }else{
        for(const x of [-w*.31,w*.31]){
          p.rod('wood',p.vec(x,ridge*.83,0),p.vec(x,ridge+.94,0),.056);
          const flag=new T.Shape();flag.moveTo(0,0);flag.lineTo(.59,-.13);flag.lineTo(0,-.27);flag.closePath();
          p.relief('oxblood',flag,.028,x,ridge+.90,0);
        }
      }
      return true;
    }
    default:return false;
  }
}

function column(p:ModelTools,x:number,z:number,h:number){
  lathe(p,'stone',x,0,z,[[.17,0],[.17,.16],[.13,.20],[.105,h-.22],[.16,h-.17],[.18,h-.10],[.18,h]],12);
}

export function streetFront(p:ModelTools,kind:RiverVenue,w:number,depth:number,h:number){
  p.face(0,()=>{
    if(kind==='library'){
      const span=w*.53;
      for(const side of [-1,1])column(p,side*span/2,.65,h-.19);
      p.box('lintel',0,h-.13,.36,span+.48,.17,.90);
      const cap=new T.Shape();cap.moveTo(-span*.65,0);cap.lineTo(0,.48);cap.lineTo(span*.65,0);cap.closePath();
      p.relief('stone',cap,.92,0,h-.05,-.06);
      for(const side of [-1,1])p.rod('lintel',p.vec(side*span*.67,h-.03,.91),p.vec(0,h+.48,.91),.07);
      p.orb('gold',0,h+.13,.87,.083);
    }else if(kind==='bathhouse'){
      for(const side of [-1,1])column(p,side*.70,.33,h-.48);
      arch(p,'copper',0,h-.48,.19,.84,.49,.13,.29);
      for(let i=0;i<13;i++)p.box(i%2?'seaGlass':'chalk',w*(i/13-.46),h-.15,.07,w/14,.14,.082);
    }else if(kind==='pottery'){
      for(const sign of [-1,1]){
        p.box('wood',sign*w*.36,.58,.20,.69,.08,.39);
        for(const dx of [-.18,.17])lathe(p,dx>0?'sage':'clay',sign*w*.36+dx,.62,.20,[[.10,0],[.13,.11],[.09,.25],[.065,.27],[.07,.31],[.05,.31]],12);
      }
    }else if(kind==='postOffice'){
      const x=-w*.33;
      p.box('oxblood',x,h-.30,.15,.78,.52,.16);
      p.box('lintel',x,h-.30,.25,.38,.23,.036);
      for(const side of [-1,1])p.rod('gold',p.vec(x+side*.19,h-.20,.28),p.vec(x,h-.33,.28),.016);
      p.box('gold',x,.79,.09,.38,.11,.09);
    }else if(kind==='boathouse'){
      for(const side of [-1,1]){
        const x=side*w*.33;
        for(const diagonal of [-1,1]){
          p.rod('ochre',p.vec(x-diagonal*.30,.37,.15),p.vec(x+diagonal*.28,h-.15,.15),.033);
          p.rod('copper',p.vec(x-diagonal*.31,.36,.15),p.vec(x-diagonal*.20,.62,.15),.069);
        }
      }
    }else if(kind==='bakery'||kind==='tearoom'||kind==='bindery'){
      const x=-w*.38, color:Pigment=kind==='bakery'?'ochre':kind==='tearoom'?'sage':'oxblood';
      p.rod('iron',p.vec(x,h-.08,0),p.vec(x,h-.08,.98),.041);
      p.rod('iron',p.vec(x,h-.38,.03),p.vec(x,h-.10,.59),.031);
      p.face(1,()=>{
        const plate=new T.Shape();plate.absellipse(0,0,.31,.23,0,Math.PI*2,false,0);
        p.relief(color,plate,.07,-.72,h-.43,-.037);
        for(const sign of [-1,1]){
          p.rod('gold',p.vec(-.72+sign*.17,h-.10,0),p.vec(-.72+sign*.17,h-.25,0),.018);
          const symbol=new T.Shape();
          if(kind==='bakery'){symbol.absellipse(0,0,.16,.078,0,Math.PI*2,false,.20);}
          else if(kind==='tearoom'){symbol.moveTo(-.13,.05);symbol.lineTo(.13,.05);symbol.quadraticCurveTo(.12,-.12,0,-.12);symbol.quadraticCurveTo(-.12,-.12,-.13,.05);}
          else{symbol.moveTo(-.16,.082);symbol.quadraticCurveTo(-.07,.11,0,.056);symbol.quadraticCurveTo(.08,.11,.16,.082);symbol.lineTo(.16,-.06);symbol.lineTo(0,-.09);symbol.lineTo(-.16,-.06);symbol.closePath();}
          p.relief('chalk',symbol,.011,-.72,h-.43,sign>0?.036:-.047);
        }
      },x);
    }
  },depth/2);
}
