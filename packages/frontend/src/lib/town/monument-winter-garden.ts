import * as T from 'three';
import { arch, lathe, roof } from './architectural-parts.js';
import { lantern, stairs, stoneArch, type Parts } from './monument-masonry.js';

const pi=Math.PI;
function pane(p:Parts,a:T.Vector3,b:T.Vector3,c:T.Vector3,d:T.Vector3) {
  const shape=new T.BufferGeometry().setFromPoints([a,b,d,b,c,d]);shape.computeVertexNormals();
  p.place(shape,'crystal',new T.Matrix4());shape.dispose();
}

const conservatory={halfSpan:15.4,halfDepth:10.2,spring:12,rise:11.4};

export const conservatoryShelter={functionName:'conservatoryExposure',source:`
  float conservatoryExposure(vec3 local){
    float span=abs(local.x)/${conservatory.halfSpan};
    float depth=abs(local.z)/${conservatory.halfDepth};
    float roof=${conservatory.spring.toFixed(1)}+${conservatory.rise}*sqrt(max(0.,1.-span*span));
    return max(smoothstep(.98,1.02,max(span,depth)),smoothstep(roof-.9,roof-.3,local.y));
  }
`};

export function winterGarden(p:Parts) {
  const {halfSpan:rx,halfDepth:depth,spring,rise}=conservatory,base=1.65;
  p.box('shade',0,-1.1,0,rx*2+1.2,4.6,depth*2+1.1);
  p.box('oxblood',0,1.09,0,rx*2+1.4,1.35,depth*2+1.4);
  p.box('stone',0,base,0,rx*2+1.75,.28,depth*2+1.7);
  const crown=(t:number,z:number,k=1)=>p.vec(rx*k*Math.cos(t),spring+rise*k*Math.sin(t),z);
  for(let bay=0;bay<=12;bay++){
    const z=-depth+bay*depth/6,heavy=bay%4===0;
    for(const sign of [-1,1]){
      const x=rx*sign;
      p.rod(heavy?'gold':'iron',p.vec(x,base,z),p.vec(x,spring,z),heavy?.16:.066);
      if(heavy){
        p.box('plaster',x,base+1.05,z,.72,2.1,.79);
        p.box('lintel',x,base+2.18,z,.9,.21,.98);
        p.box('gold',x,spring,z,.64,.35,.59);
      }
      if(bay<12){
        pane(p,p.vec(x,base,z),p.vec(x,spring,z),p.vec(x,spring,z+depth/6),p.vec(x,base,z+depth/6));
        for(const y of [base+3.1,base+6.25,spring-.37,spring+.16])p.box('iron',x,y,z+depth/12,.13,.09,depth/6+.02);
      }
    }
    for(let j=0;j<24;j++){
      const a=crown(j*pi/24,z),b=crown((j+1)*pi/24,z);
      p.rod(heavy?'gold':'iron',a,b,heavy?.16:.071);
      if(heavy)p.rod('copper',crown(j*pi/24,z,.966),crown((j+1)*pi/24,z,.966),.07);
      if(heavy && j%2===0)p.rod('gold',a,crown((j+1)*pi/24,z,.966),.055);
      if(bay===12)continue;
      const back=crown(j*pi/24,z+depth/6),next=crown((j+1)*pi/24,z+depth/6);
      pane(p,a,b,next,back);
      if(j%2===0)p.rod('copper',a,back,.06);
    }
  }
  for(const side of [-1,1])p.at(0,0,side*depth,side===1?0:pi,()=>{
    const center=p.vec(0,spring,0);
    for(let j=0;j<24;j++)pane(p,center,crown(j*pi/24,0),crown((j+1)*pi/24,0),center);
    pane(p,p.vec(-rx,base,0),p.vec(rx,base,0),p.vec(rx,spring,0),p.vec(-rx,spring,0));
    for(const k of [.15,.42,.70,.93,1])arch(p,k===1?'gold':'copper',0,spring,.09,rx*k,rise*k,k===1?.23:.105,.13);
    for(let i=0;i<=20;i++)p.rod(i%5===0?'gold':'iron',center,crown(pi*i/20,.13),i%5===0?.098:.053);
    for(let i=-8;i<=8;i++){
      const x=rx*i/8;
      p.box(i%4===0?'gold':'copper',x,(base+spring)/2,.1,i%4===0?.18:.083,spring-base,.11);
    }
    for(const y of [base+2.7,base+5.45,spring-.30,spring])p.box('copper',0,y,.1,rx*2,.105,.14);
    for(const k of [1.9,3.7,5.45])arch(p,'gold',0,base+2.05,.17,k,k,.10,.12);
    for(let i=0;i<=8;i++)p.rod('iron',p.vec(0,base+2.05,.2),p.vec(5.4*Math.cos(i*pi/8),base+2.05+5.4*Math.sin(i*pi/8),.2),.062);
    p.box('oxblood',0,1.16,.47,3.25,2.65,1.1);
    p.box('wood',0,1.16,1.04,1.87,2.64,.12);
    p.box('amber',0,1.68,1.12,1.47,1.73,.07);
    stoneArch(p,0,2.05,1.05,1.39,1.22,.28,.31);
    for(const x of [-1.25,1.25])p.box('stone',x,1.1,1.19,.29,2.2,.29);
    p.box('iron',0,1.65,1.18,.09,1.9,.06);p.box('iron',0,1.69,1.18,1.55,.09,.06);
    for(const x of [-rx,0,rx]){
      const y=x===0?spring+rise:spring;
      lathe(p,'gold',x,y,.07,[[.29,0],[.25,.27],[.14,.4],[.18,.63],[.03,1.03]],12);
    }
  });
  const ridge=spring+rise;
  p.box('wood',0,ridge+.2,0,2.9,.42,depth*1.69);
  p.box('seaGlass',0,ridge+.76,0,2.54,.88,depth*1.64);
  for(const x of [-1.31,1.31])for(let i=-7;i<=7;i++)p.box('gold',x,ridge+.77,i*1.14,.10,.95,.1);
  p.at(0,ridge+1.23,0,pi/2,()=>roof(p,depth*1.78,3.3,0,.76,'copper',.94));
  lathe(p,'foliage',0,base+.11,0,[[.01,0],[7.8,0],[7.8,.1],[.01,.1]],48);
  lathe(p,'lintel',0,base+.16,0,[[7.9,0],[7.9,.13],[8.85,.13],[8.85,0]],64);
  for(const x of [-11,11])for(const z of [-5,4.8]){
    p.box('wood',x,base+.75,z,2.85,.17,.68);
    for(const dx of [-1,1])p.box('iron',x+dx,base+.45,z,.12,.67,.52);
  }
  p.at(0,-.88,depth+1.1,0,()=>stairs(p,3.12,4.07,.95));
  for(const x of [-2.75,2.75])lantern(p,x,0,depth+2.2);
}

function randomSequence(seed:number) {
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}

export function sakura(p:Parts) {
  const rand=randomSequence(8743);
  const buds:{at:T.Vector3;size:number;turn:number}[]=[];
  const origin=p.vec(0,1.83,0);
  function limb(points:T.Vector3[],r0:number,r1:number) {
    const curve=new T.CatmullRomCurve3(points);
    const vertices:number[]=[],indices:number[]=[],rings=10,sides=9;
    let normal=p.vec(0,0,1);
    for(let j=0;j<=rings;j++){
      const t=j/rings,c=curve.getPoint(t),axis=curve.getTangent(t).normalize();
      const right=axis.clone().cross(normal).normalize();normal=right.clone().cross(axis).normalize();
      for(let i=0;i<sides;i++){
        const a=2*pi*i/sides,r=T.MathUtils.lerp(r0,r1,t)*(1+.085*Math.cos(3*a+t));
        const v=c.clone().addScaledVector(right,r*Math.cos(a)).addScaledVector(normal,r*Math.sin(a));
        vertices.push(v.x,v.y,v.z);
        if(j<rings){const k=j*sides+i,n=j*sides+(i+1)%sides;indices.push(k,k+sides,n,n,k+sides,n+sides);}
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);
    const flat=g.toNonIndexed();flat.computeVertexNormals();p.place(flat,'wood',new T.Matrix4());flat.dispose();g.dispose();
  }
  for(let i=0;i<7;i++){
    const a=i*2.4;limb([origin.clone().add(p.vec(0,.9,0)),origin.clone().add(p.vec(1.5*Math.cos(a),.10,1.5*Math.sin(a))),origin.clone().add(p.vec(2.5*Math.cos(a+.15),.02,2.5*Math.sin(a+.15)))],.52,.06);
  }
  const fork=origin.clone().add(p.vec(.45,3.7,-.19));
  limb([origin,origin.clone().add(p.vec(-.65,1.65,.15)),fork],1.17,.82);
  for(let i=0;i<9;i++){
    const a=2.4*i+.32,high=i%3===2,reach=(high?2.5:5.3)+rand()*2.15,up=high?6.3:2.5+(i%3)*1.1;
    const elbow=fork.clone().add(p.vec(Math.cos(a)*reach*.53,up*.41,Math.sin(a)*reach*.47));
    const split=fork.clone().add(p.vec(Math.cos(a)*reach,up,Math.sin(a)*reach*.83));
    limb([fork,elbow,split],.69-i*.034,.27);
    for(let j=0;j<4;j++){
      const b=a+(j-1.5)*.59,r=1.65+rand()*2.35;
      const tip=split.clone().add(p.vec(r*Math.cos(b),1.24+rand()*2.0,r*Math.sin(b)*.83));
      limb([elbow,split,tip],.27,.065);
      buds.push({at:tip,size:1.63+rand()*.72,turn:b});
      if(j%2===0)buds.push({at:split.clone().lerp(tip,.45),size:1.47+rand()*.67,turn:b+.8});
    }
  }
  return buds;
}

export function blossomCrown(buds:ReturnType<typeof sakura>) {
  const rand=randomSequence(2638),pos:number[]=[],rgb:number[]=[];
  const shade=new T.Color('#c57583'),middle=new T.Color('#f2a5b1'),sun=new T.Color('#ffebe1');
  const tint=new T.Color(),tip=new T.Color();
  function point(x:number,y:number,z:number,color:T.Color){
    pos.push(x,y,z);rgb.push(color.r,color.g,color.b);
  }
  for(const {at,size,turn} of buds){
    for(let tuft=0;tuft<14;tuft++){
      const a=turn+rand()*pi*2,rad=size*Math.sqrt(rand()),dx=Math.cos(a)*rad,dz=Math.sin(a)*rad*.83;
      const cx=at.x+dx,cz=at.z+dz,cy=at.y+size*(.38-rad/size*.32)+size*(rand()-.5)*.67;
      const spread=size*(.23+rand()*.29);
      const core=spread*.73,angle=rand()*pi*2;
      const warmth=T.MathUtils.clamp(.18+.092*(cy-8)+.36*rand(),0,1);
      tint.copy(shade).lerp(middle,warmth);tip.copy(middle).lerp(sun,.22+.48*warmth);
      for(let petal=0;petal<7;petal++){
        const a=angle+petal*pi*2/7,b=angle+(petal+1)*pi*2/7;
        point(cx,cy+core*.38,cz,tip);
        point(cx+core*Math.cos(a),cy-.08*core,cz+core*.74*Math.sin(a),tint);
        point(cx+core*Math.cos(b),cy-.08*core,cz+core*.74*Math.sin(b),tint);
      }
      for(let spray=0;spray<20;spray++){
        const b=rand()*2*pi,r=spread*Math.sqrt(rand());
        const x=cx+r*Math.cos(b),z=cz+r*Math.sin(b),y=cy+.27*spread*(1-r/spread)+(rand()-.5)*spread*.63;
        const d=.14+.14*rand(),direction=rand()*2*pi;
        const light=T.MathUtils.clamp(.31+.24*(y-8)/5+.18*Math.cos(b)+.38*rand(),0,1);
        tint.copy(shade).lerp(middle,Math.min(1,light*1.59));tip.copy(middle).lerp(sun,Math.min(1,light+.21));
        for(let lobe=0;lobe<3;lobe++){
          const angle=direction+lobe*2.09,cos=Math.cos(angle),sin=Math.sin(angle);
          const lift=d*(.10+.81*rand()),w=d*.59;
          point(x,y,z,tint);point(x+cos*d*.65+sin*w,y+lift*.35,z+sin*d*.65-cos*w,tip);point(x+cos*d*1.5,y+lift,z+sin*d*1.5,tip);
          point(x,y,z,tint);point(x+cos*d*1.5,y+lift,z+sin*d*1.5,tip);point(x+cos*d*.65-sin*w,y+lift*.58,z+sin*d*.65+cos*w,tint);
        }
      }
    }
  }
  for(let i=0;i<740;i++){
    const a=rand()*2*pi,r=7.7*Math.sqrt(rand()),x=r*Math.cos(a),z=r*Math.sin(a),d=.044+.085*rand();
    tint.copy(middle).lerp(sun,rand());point(x-d,1.891,z,tint);point(x,1.895,z+d,tint);point(x+d,1.891,z-d,tint);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(rgb,3));geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide,emissive:'#b26b7a',emissiveIntensity:.18}));
  mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
