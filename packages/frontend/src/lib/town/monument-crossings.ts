import * as T from 'three';
import { arcade, lantern, pavilion, railing, stack, stairs, type Parts } from './monument-masonry.js';

const pi=Math.PI;
const lines=[
  {x:-7.6,y:16.8,sag:9.8,depth:4.3},
  {x:.9,y:21.8,sag:9.1,depth:5.2},
  {x:9.8,y:26.5,sag:7.7,depth:4.1}
];

function wheel(p:Parts,x:number,y:number,z:number,r:number) {
  p.at(x,y,z,pi/2,()=>{
    const rim=new T.TorusGeometry(r,.095,6,24).toNonIndexed();
    p.place(rim,'gold',new T.Matrix4());rim.dispose();
    for(let i=0;i<8;i++)p.rod('wood',p.vec(0,0,0),p.vec(r*Math.cos(i*pi/4),r*Math.sin(i*pi/4),0),.06);
    p.rod('iron',p.vec(0,0,-.63),p.vec(0,0,.63),.16);
  });
}

export function exchangeBank(p:Parts,side:1|-1) {
  p.at(0,.6,side*-1.1,0,()=>arcade(p,24,9.7,7,5.5,'shade',8));
  p.at(0,6.35,side*3.6,0,()=>railing(p,24,true));
  for(const [i,x] of [-7.7,.8,9.7].entries()){
    const step=i*(side===1?2:2.8),back=-side*(3.1+i*4.8),w=i===1?9.8:8.35;
    p.at(x,6.31,back,0,()=>{
      if(step){
        p.at(0,-3.2,0,side===1?0:pi,()=>arcade(p,w+1.2,6.8,3,step+3.2,'shade',7));
        p.at(0,step+.16,side*3.37,0,()=>railing(p,w+.7,true));
      }
      p.at(0,step,0,side===1?0:pi,()=>pavilion(p,w,6.1,2+i%2+(side===-1&&i===2?1:0),4,i%2?'ochre':'plaster',i===0?'clay':'copper',i+(side===1?1:3)));
    });
    const line=lines[i]!,y=line.y-6.32;
    p.at(line.x,6.32,0,0,()=>{
      for(const sx of [-1,1])for(const sz of [-1,1]){
        const foot=p.vec(sx*1.30,0,sz*1.45),top=p.vec(sx*.45,y-.33,sz*.35);
        p.rod('wood',foot,top,.22);
        p.box('stone',foot.x,.2,foot.z,.65,.43,.67);
      }
      for(let j=0;j<3;j++){
        const bottom=y*j/3,top=y*(j+1)/3,wide=1.21-.73*j/3,narrow=1.21-.73*(j+1)/3;
        for(const sx of [-1,1])p.rod('wood',p.vec(sx*wide,bottom,wide),p.vec(-sx*narrow,top,narrow),.104);
        p.box('iron',0,top,0,narrow*2+.3,.18,narrow*2+.4);
      }
      wheel(p,0,y-.59,0,.6);
      p.rod('iron',p.vec(.48,y-.35,0),p.vec(.48,1,side*-4.1),.055);
      p.rod('wood',p.vec(-1.0,0,-side*2.4),p.vec(-1.0,3.2,-side*.6),.16);
      wheel(p,0,1.1,-side*1.7,.64);
    });
  }
  p.at(-9.15,.3,-side*7.9,-pi/2,()=>{
    arcade(p,22,3.2,6,5.91,'shade',9);
    p.at(0,6.1,1.42,0,()=>railing(p,22,true));
  });
  p.at(4.55,0,-side*21.2,-pi/2,()=>{
    arcade(p,13.8,6.9,4,7.45,'shade',9);
    p.at(0,7.64,0,0,()=>pavilion(p,13.2,6.1,side===1?3:4,6,'oxblood','copper',2));
    p.at(0,side===1?16.83:19.33,0,0,()=>{
      p.box('wood',0,.43,0,6.9,.88,1.8);
      for(let i=0;i<8;i++)p.box('seaGlass',(i-3.5)*.8,.44,.91,.61,.53,.06);
      p.box('copper',0,.98,0,7.3,.24,2.13);
    });
  });
  p.at(9.65,7.1,-side*15.25,0,()=>stack(p,15.9));
  p.at(-8.8,6.3,-side*5.5,side===1?0:pi,()=>{
    for(let i=0;i<3;i++){
      const x=-2.8+2.5*i;
      p.box('wood',x,1.46,0,.22,2.92,.22);p.box('wood',x,1.46,.8,.22,2.92,.22);
      p.rod('iron',p.vec(x-.35,2.2,.2),p.vec(x+.35,2.2,.2),.1);
      p.box('chalk',x,1.84,.46,.76,1.35,.23);
    }
  });
  p.at(-8.7,.5,side*5.3,side===1?0:pi,()=>stairs(p,2.2,9.5,5.91));
  for(const x of [-11,-4.2,4.1,11.4])lantern(p,x,6.34,side*4);
}

function linePoint(index:number,t:number,span:number,rise:number) {
  const line=lines[index]!,s=4*t*(1-t);
  return new T.Vector3(line.x+s*Math.sin(index*1.6+t*pi)*1.21,line.y+rise*t-line.sag*s,span*t);
}

export function exchangeRigging(p:Parts,span:number,rise:number) {
  for(let lane=0;lane<lines.length;lane++){
    for(let j=0;j<36;j++)p.rod('wood',linePoint(lane,j/36,span,rise),linePoint(lane,(j+1)/36,span,rise),.053);
  }
}

export function wovenLinen(span:number,rise:number,wind:T.IUniform<number>) {
  const pos:number[]=[],uv:number[]=[],rgb:number[]=[],hem:number[]=[],indices:number[]=[];
  const colors=[new T.Color('#fff0cc'),new T.Color('#efdab5'),new T.Color('#fff6da')];
  for(let lane=0;lane<lines.length;lane++){
    const cols=108,rows=8,begin=pos.length/3;
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
      const t=i/cols,v=j/rows,start=linePoint(lane,t,span,rise);
      const full=Math.pow(Math.sin(pi*t),.74),billow=Math.sin(pi*v)*full;
      const phase=t*(43+4*lane)+lane*1.7-v*2.75+1.25*Math.sin(t*15+lane);
      const fold=Math.sin(phase)+.38*Math.sin(t*95+v*2.5+lane);
      const pleat=full*(.22*v+.78*Math.sin(v*pi*.74));
      const breadth=lines[lane]!.depth*full;
      pos.push(start.x-breadth*v*(.83+.18*Math.sin(t*pi*2+lane))-1.73*pleat*fold,
        start.y-breadth*v*(.66+.36*v)-.64*pleat*(1.2+fold)-.78*full*v*Math.cos(t*31+lane),start.z+billow*Math.sin(t*28+v*2)*.36);
      uv.push(t*16.0,v);hem.push(full*v);
      const tint=colors[lane]!,light=.85+.13*full*Math.cos(phase-.2)+.065*Math.cos(t*12*pi+.6*lane)+.035*Math.cos(t*36*pi-v*2);
      rgb.push(tint.r*light,tint.g*light,tint.b*light);
      if(i<cols && j<rows){const a=begin+j*(cols+1)+i;indices.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1);}
    }
  }
  const size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const seam=x<=1||x===4||y<=1||y===4||y===size-4;
    const grain=3*Math.sin(x*pi*.5)+2*Math.cos(y*pi*.5)+2*Math.sin(x*1.7+y*.81);
    const value=Math.round((seam?171:245)+grain),offset=(y*size+x)*4;
    data.set([value,value-1,value-3,255],offset);
  }
  const texture=new T.DataTexture(data,size,size);texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.colorSpace=T.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.needsUpdate=true;
  const geometry=new T.BufferGeometry();
  geometry.setIndex(indices);geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));geometry.setAttribute('hem',new T.Float32BufferAttribute(hem,1));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new T.Float32BufferAttribute(rgb,3));geometry.computeVertexNormals();
  const material=new T.MeshPhysicalMaterial({vertexColors:true,map:texture,side:T.DoubleSide,roughness:.94,sheen:.48,sheenColor:'#f7dcb6',sheenRoughness:.78,emissive:'#a8835a',emissiveIntensity:.12});
  const wave=`
    uniform float linenTime;attribute float hem;
    vec3 linenWave(vec3 p){
      float gust=.74+.26*sin(linenTime*.51+p.x*.17);
      float swell=p.z*.155-linenTime*1.58+p.x*.16;
      float ripple=p.z*.59-linenTime*2.65+p.y*.17;
      return hem*gust*vec3(2.14*sin(swell)+.55*sin(ripple),1.38*cos(swell*.93)+.38*sin(ripple),.33*sin(ripple*.77));
    }
  `;
  const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide});
  for(const skin of [material,depth])skin.onBeforeCompile=shader=>{
    shader.uniforms.linenTime=wind;
    shader.vertexShader=wave+shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n transformed+=linenWave(position);');
    if(skin===material)shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\n vec3 slope=(linenWave(position+vec3(0.,0.,.05))-linenWave(position))/.05;objectNormal.z-=dot(objectNormal,slope);');
  };
  geometry.computeBoundingSphere();geometry.boundingSphere!.radius+=3.3;
  const mesh=new T.Mesh(geometry,material);mesh.customDepthMaterial=depth;mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
