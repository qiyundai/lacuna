import { coastlineAt, frontage, waterline, type Coast, type Site } from './painted-coast.js';

const W=1800,H=900;
const clamp=(n:number,low:number,high:number)=>Math.max(low,Math.min(high,n));
async function load(name:string){
  const img=new Image();img.src='/city/paint/'+name+'.webp';await img.decode();return img;
}

export async function createPanorama(canvas:HTMLCanvasElement){
  const names=[...frontage,'coast','promenade','ferry'] as const;
  const images=new Map(await Promise.all(names.map(async name=>[name,await load(name)] as const)));
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Canvas unavailable');
  const world=ctx;
  const features=new Map<number,Site[]>();
  const layers=new Map<number,HTMLCanvasElement>();
  let coast:Coast={sites:[],addresses:new Map(),rooms:new Map(),neighborhoods:new Map(),ports:[],service:0,start:0,end:W};
  let width=1,height=1,pixel=1,zoom=1,centerX=965,centerY=448,manual=false;
  let paused=false,skipped=false,destroyed=false,frame=0,last=0,time=0;
  let reveal:{site:Site;elapsed:number;old:HTMLCanvasElement}|null=null;
  const signals=new AbortController(),options={signal:signals.signal};
  const touches=new Map<number,{x:number;y:number}>();
  function scale(){return Math.max(width/W,height/H)*zoom;}
  function constrain(){
    const halfX=width/scale()/2,halfY=height/scale()/2;
    centerX=clamp(centerX,coast.start+halfX,Math.max(coast.start+halfX,coast.end-halfX));
    centerY=clamp(centerY,halfY,H-halfY);
  }
  function imageOf(kind:typeof names[number]){return images.get(kind)!;}
  function drawSite(c:CanvasRenderingContext2D,site:Site,left:number){
    const img=imageOf(site.kind),w=site.width,h=site.elevation === undefined ? w*img.height/img.width : w,x=site.x-left;
    c.save();c.translate(x,site.y);
    const shadow=c.createRadialGradient(0,0,0,0,0,w*.54);
    shadow.addColorStop(0,'rgba(43,33,48,.59)');shadow.addColorStop(1,'rgba(43,33,48,0)');
    c.save();c.scale(1,.16);c.fillStyle=shadow;c.fillRect(-w*.55,-w*.55,w*1.1,w*1.1);c.restore();
    if(site.mirror)c.scale(-1,1);
    if (site.elevation === undefined) c.drawImage(img,-w/2,-h,w,h);
    else {
      const size=img.width/3;
      c.drawImage(img,(site.elevation%3)*size,Math.floor(site.elevation/3)*size,size,size,-w/2,-h,w,h);
    }
    for(let i=0;i<site.lights;i++){
      const lx=(i-1)*w*.20,ly=-h*(.16+i*.055),r=w*.105;
      const lamp=c.createRadialGradient(lx,ly,0,lx,ly,r);
      lamp.addColorStop(0,'rgba(255,214,142,.9)');lamp.addColorStop(.16,'rgba(255,191,99,.65)');lamp.addColorStop(1,'rgba(255,172,93,0)');
      c.fillStyle=lamp;c.fillRect(lx-r,ly-r,r*2,r*2);
      c.fillStyle='#ffe3a8';c.fillRect(lx-1.1,ly-1.6,2.2,3.2);
    }
    c.restore();
  }
  function plate(left:number){
    const old=layers.get(left);if(old)return old;
    const layer=document.createElement('canvas');layer.width=W;layer.height=H;
    const c=layer.getContext('2d')!;
    c.drawImage(imageOf('coast'),0,0,W,H);
    const sites=coast.sites.filter(s=>s.x>=left-150&&s.x<left+W+150).sort((a,b)=>a.y-b.y);
    if(sites.length>1){
      const works=document.createElement('canvas');works.width=W;works.height=H;
      const paint=works.getContext('2d')!;
      for(const s of sites){
        const x=s.x-left,y=s.y;
        const dock=s.kind==='wharf'||s.kind==='arches';
        paint.save();paint.translate(x,y+47);paint.scale(1,dock?1.14:.8);
        const r=dock?265:207,g=paint.createRadialGradient(0,0,r*.18,0,0,r);
        g.addColorStop(0,'white');g.addColorStop(.68,'rgba(255,255,255,.85)');g.addColorStop(1,'transparent');
        paint.fillStyle=g;paint.fillRect(-r,-r,2*r,2*r);paint.restore();
      }
      paint.globalCompositeOperation='source-in';paint.drawImage(imageOf('promenade'),0,0,W,H);
      c.drawImage(works,0,0);works.width=0;works.height=0;
    }
    for(const s of sites){
      const p=s.predecessor;if(!p || Math.abs(p.x-s.x)>215 || Math.abs(p.y-s.y)>60)continue;
      const ax=p.x-left,bx=s.x-left;
      c.beginPath();c.moveTo(ax,p.y-1);c.bezierCurveTo(ax+(bx-ax)*.38,p.y+10,ax+(bx-ax)*.69,s.y+7,bx,s.y);
      c.lineWidth=6;c.strokeStyle='rgba(73,57,54,.4)';c.stroke();
      c.lineWidth=3;c.strokeStyle='rgba(221,186,139,.86)';c.stroke();
    }
    for(const s of sites)drawSite(c,s,left);
    for(const s of sites.filter(s=>s.kind==='wharf'||s.kind==='beacon')){
      const x=s.x-left,y=coastlineAt(x)+2;
      for(let i=0;i<21;i++){
        const span=1.2+i*.35,dx=Math.sin(i*8.31+x)*span*.4;
        c.fillStyle='rgba(255,196,124,'+(.22*(1-i/22))+')';
        c.fillRect(x+dx-span/2,y+i*2.4,span,1);
      }
    }
    layers.set(left,layer);return layer;
  }
  function renderTile(left:number){
    const img=plate(left);
    const landmarks=features.get(left)??[];
    world.save();
    if(Math.abs(left/W)%2===1){world.translate(2*left+W,0);world.scale(-1,1);}
    world.drawImage(img,left,0);
    if(reveal && Math.floor(reveal.site.x/W)*W===left){
      world.globalAlpha=1-Math.min(1,reveal.elapsed/1.65);
      world.drawImage(reveal.old,left,0);world.globalAlpha=1;
    }
    world.save();world.translate(left,0);
    world.save();world.beginPath();world.moveTo(0,H);
    for(let i=0;i<waterline.length;i++)world.lineTo(i*150,waterline[i]!+5);
    world.lineTo(W,H);world.closePath();world.clip();
    for(let y=450;y<H;y+=5){
      const shift=.78*Math.sin(y*.16+time*.64)+.51*Math.cos(y*.057-time*.79);
      world.drawImage(img,2,y,W-4,5,2+shift,y,W-4,5);
    }
    world.restore();
    if(landmarks.some(s=>s.kind==='wharf')){
      const phase=(time*.007+left*.001+.14)%(Math.PI*2),dx=Math.sin(phase);
      const x=885+Math.sin(phase)*685,y=coastlineAt(x)+63+.5*Math.sin(time*1.7);
      world.save();world.translate(x,y);if(Math.cos(phase)<0)world.scale(-1,1);
      world.strokeStyle='rgba(236,223,196,.6)';world.lineWidth=1.15;
      for(let i=0;i<4;i++){world.beginPath();world.moveTo(-30-i,0);world.quadraticCurveTo(-42-i*4,1+i*.45,-55-i*6,2+i*1.3);world.stroke();}
      const boat=imageOf('ferry'),w=69+8*Math.abs(dx),h=w*boat.height/boat.width;
      world.save();world.scale(1,-.32);world.globalAlpha=.20;world.drawImage(boat,-w/2,-h,w,h);world.restore();
      world.drawImage(boat,-w/2,-h,w,h);world.restore();
    }
    for(const viaduct of landmarks.filter(s=>s.kind==='arches')){
      const x=viaduct.x-left,w=viaduct.width,img=imageOf('arches'),h=w*img.height/img.width;
      const u=.1+.80*(.5+.5*Math.sin(time*.1+.4));
      world.save();world.translate(x,viaduct.y);if(viaduct.mirror)world.scale(-1,1);
      const tx=(u-.5)*w,ty=-h*(.63+u*.33);
      world.fillStyle='#66534b';world.fillRect(tx-6,ty-3,13,3.5);world.fillStyle='#f7d29a';world.fillRect(tx-5,ty-2.2,9.5,1.1);
      world.restore();
    }
    for(const beacon of landmarks.filter(s=>s.kind==='beacon')){
      const x=beacon.x-left+beacon.width*(beacon.mirror ? .116 : -.116);
      const h=beacon.width*imageOf('beacon').height/imageOf('beacon').width;
      const y=beacon.y-h*.80,angle=time*.20,direction=Math.cos(angle);
      const reach=235*direction;
      const beam=world.createLinearGradient(x,y,x+reach+.01,y);
      beam.addColorStop(0,'rgba(255,232,177,.23)');beam.addColorStop(1,'rgba(255,224,173,0)');
      world.beginPath();world.moveTo(x,y);world.lineTo(x+reach,y-9+Math.sin(angle)*12);world.lineTo(x+reach,y+9+Math.sin(angle)*12);world.closePath();
      world.fillStyle=beam;world.fill();
    }
    world.restore();world.restore();
  }
  function draw(now:number){
    frame=0;if(destroyed||skipped||document.hidden)return;
    const dt=last?Math.min(.1,(now-last)/1000):0;
    if(!paused && last && now-last<37){schedule();return;}
    last=now;if(!paused)time+=dt;
    if(reveal){reveal.elapsed+=dt;if(reveal.elapsed>=1.65||paused)reveal=null;}
    world.setTransform(pixel,0,0,pixel,0,0);
    world.translate(width/2,height/2);world.scale(scale(),scale());world.translate(-centerX,-centerY);
    const half=width/(2*scale()),first=Math.floor((centerX-half+.01)/W)*W,end=centerX+half;
    for(let left=first;left<end-.01;left+=W)renderTile(left);
    for(const left of layers.keys())if(left<first-W||left>end+W)layers.delete(left);
    if(!paused)schedule();
  }
  function schedule(){
    if(!frame&&!destroyed&&!skipped&&!document.hidden)frame=requestAnimationFrame(draw);
  }
  function wake(){
    last=0;schedule();
  }
  function resize(){
    width=Math.max(1,canvas.clientWidth);height=Math.max(1,canvas.clientHeight);pixel=Math.min(devicePixelRatio,1.65);
    canvas.width=Math.round(width*pixel);canvas.height=Math.round(height*pixel);constrain();wake();
  }
  function magnify(factor:number){
    manual=true;zoom=clamp(zoom*factor,1,2.65);constrain();wake();
  }
  function pan(x:number,y:number){
    manual=true;centerX-=x/scale();centerY-=y/scale();constrain();wake();
  }
  canvas.addEventListener('pointerdown',e=>{
    canvas.setPointerCapture(e.pointerId);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});},options);
  canvas.addEventListener('pointermove',e=>{
    const old=touches.get(e.pointerId);if(!old)return;
    const other=[...touches.entries()].find(([id])=>id!==e.pointerId)?.[1];
    if(other){
      const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);
      if(before>4)magnify(after/before);
    }else pan(e.clientX-old.x,e.clientY-old.y);
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  },options);
  canvas.addEventListener('lostpointercapture',e=>touches.delete(e.pointerId),options);
  canvas.addEventListener('wheel',e=>{e.preventDefault();magnify(Math.exp(-.0013*e.deltaY));},{...options,passive:false});
  canvas.addEventListener('keydown',e=>{
    if(e.key==='+'||e.key==='=')magnify(1.2);else if(e.key==='-')magnify(1/1.2);
    else if(e.key==='ArrowLeft')pan(70,0);else if(e.key==='ArrowRight')pan(-70,0);
    else if(e.key==='ArrowUp')pan(0,55);else if(e.key==='ArrowDown')pan(0,-55);else return;
    e.preventDefault();
  },options);
  function visibility(){
    if(document.hidden||skipped){cancelAnimationFrame(frame);frame=0;last=0;}else wake();
  }
  document.addEventListener('visibilitychange',visibility,options);
  canvas.addEventListener('contentvisibilityautostatechange',e=>{skipped=(e as ContentVisibilityAutoStateChangeEvent).skipped;visibility();},options);
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  return {
    update(next:Coast,animate=false){
      const site=next.latest,left=site?Math.floor(site.x/W)*W:0;
      reveal=animate&&site&&!paused?{site,elapsed:0,old:plate(left)}:null;
      coast=next;layers.clear();features.clear();
      for(const landmark of coast.sites){
        if(!['beacon','arches','wharf'].includes(landmark.kind))continue;
        const key=Math.floor(landmark.x/W)*W,group=features.get(key)??[];
        group.push(landmark);features.set(key,group);
      }
      const focus=site&&Math.abs(left/W)%2===1?left+W-(site.x-left):site?.x??965;
      if(!manual){
        zoom=coast.sites.length<3?1.35:coast.sites.length<8?1.2:1.07;
        centerX=left+(coast.sites.length<3?1135:935);centerY=454;
      }
      if(site&&animate && Math.abs(focus-centerX)>width/scale()*.38)centerX=focus;
      constrain();wake();
    },
    pause(value:boolean){paused=value;if(value)reveal=null;wake();},
    destroy(){destroyed=true;cancelAnimationFrame(frame);signals.abort();observer.disconnect();layers.clear();images.clear();}
  };
}
