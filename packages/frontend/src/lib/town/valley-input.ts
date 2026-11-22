import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three';
import { valleyZoomLimit } from './valley-camera.js';

type Contact = {x:number; y:number; startX:number; startY:number; pan:boolean; dolly:boolean; dragging:boolean};
const keys = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','=','-']);

export function valleyInput(canvas:HTMLCanvasElement, camera:PerspectiveCamera, target:Vector3,
  signal:AbortSignal, wake:()=>void, interrupt:()=>void, home:()=>void, pick:(x:number,y:number)=>void){
  const contacts=new Map<number,Contact>(), held=new Map<string,number>();
  const offset=new Vector3(), angles=new Spherical();
  let yaw=0, pitch=0, panX=0, panY=0, zoom=0;
  let wheelZoom=0,wheelSince=0,wheelEnd=0;
  const active=()=>!!(yaw || pitch || panX || panY || zoom || wheelZoom || held.size);
  function keyTravel(key:string, elapsed:number){
    const dt=MathUtils.clamp(elapsed/1000,0,.06);
    if(key==='ArrowRight')yaw+=dt*.74;
    if(key==='ArrowLeft')yaw-=dt*.74;
    if(key==='ArrowUp')pitch-=dt*.56;
    if(key==='ArrowDown')pitch+=dt*.56;
    if(key==='-')zoom+=dt*.85;
    if(key==='=')zoom-=dt*.85;
  }
  function step(now:number){
    for(const [key,since] of held){
      keyTravel(key,now-since);
      held.set(key,Math.max(since,now));
    }
    if(wheelZoom && now>wheelSince){
      const portion=Math.min(1,(now-wheelSince)/(wheelEnd-wheelSince));
      const delta=wheelZoom*portion;
      zoom+=delta;wheelZoom-=delta;wheelSince=now;
    }
    if(!(yaw || pitch || panX || panY || zoom))return;
    angles.setFromVector3(offset.subVectors(camera.position,target));
    const scale=2*angles.radius*Math.tan(MathUtils.degToRad(camera.fov/2))/Math.max(1,canvas.clientHeight);
    const cos=Math.cos(angles.theta),sin=Math.sin(angles.theta);
    target.x+=(-cos*panX-sin*panY)*scale;
    target.z+=(sin*panX-cos*panY)*scale;
    angles.theta+=yaw;
    if(pitch)angles.phi=MathUtils.clamp(angles.phi+pitch,.22,1.84);
    if(zoom)angles.radius=MathUtils.clamp(angles.radius*Math.exp(zoom),Math.min(7,angles.radius),valleyZoomLimit);
    camera.position.copy(target).add(offset.setFromSpherical(angles));
    yaw=pitch=panX=panY=zoom=0;
  }
  function reset(){
    contacts.clear();held.clear();yaw=pitch=panX=panY=zoom=wheelZoom=0;
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button<0 || event.button>2)return;
    wheelZoom=0;
    canvas.focus({preventScroll:true});
    canvas.setPointerCapture(event.pointerId);
    const pan=event.button===2 || event.shiftKey || event.ctrlKey || event.metaKey;
    contacts.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,
      pan,dolly:event.button===1,dragging:pan || event.button!==0 || contacts.size>0});
    if(contacts.size>1)for(const contact of contacts.values())contact.dragging=true;
    interrupt();
  },{signal});
  function move(event:PointerEvent){
    const point=contacts.get(event.pointerId);
    if(!point)return;
    let dx=event.clientX-point.x,dy=event.clientY-point.y;
    if(!dx && !dy)return;
    if(contacts.size===2){
      const other=[...contacts.values()].find(contact=>contact!==point)!;
      const before=Math.hypot(point.x-other.x,point.y-other.y);
      const after=Math.hypot(event.clientX-other.x,event.clientY-other.y);
      if(before>1 && after>1)zoom+=Math.log(before/after);
      panX+=dx*.5;panY+=dy*.5;
    }else if(contacts.size===1){
      if(!point.dragging){
        dx=event.clientX-point.startX;dy=event.clientY-point.startY;
        const distance=Math.hypot(dx,dy),threshold=event.pointerType==='touch'?5:3;
        point.dragging=distance>threshold;
        const excess=point.dragging?1-threshold/distance:0;
        dx*=excess;dy*=excess;
      }
      if(point.dolly)zoom+=dy*.004;
      else if(point.pan){panX+=dx;panY+=dy;}
      else{
        const radians=Math.PI/Math.max(1,canvas.clientHeight);
        yaw-=dx*radians;pitch-=dy*radians;
      }
    }
    point.x=event.clientX;point.y=event.clientY;
    if(active())wake();
  }
  canvas.addEventListener('pointermove',move,{signal});
  canvas.addEventListener('pointerup',event=>{
    const point=contacts.get(event.pointerId);
    if(!point)return;
    move(event);contacts.delete(event.pointerId);
    if(!point.dragging && event.button===0)pick(event.clientX,event.clientY);
  },{signal});
  const cancel=(event:PointerEvent)=>contacts.delete(event.pointerId);
  canvas.addEventListener('pointercancel',cancel,{signal});
  canvas.addEventListener('lostpointercapture',cancel,{signal});
  canvas.addEventListener('contextmenu',event=>event.preventDefault(),{signal});
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();interrupt();
    const unit=event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1;
    const delta=MathUtils.clamp(event.deltaY*unit*(event.ctrlKey ? .006 : .0012),-.22,.22);
    if(Math.abs(delta)<=.025)zoom+=delta;
    else{
      const now=performance.now();
      if(!wheelZoom)wheelSince=now;
      wheelEnd=now+85;
      wheelZoom+=delta;
    }
    wake();
  },{passive:false,signal});
  canvas.addEventListener('keydown',event=>{
    if(event.altKey || event.ctrlKey || event.metaKey)return;
    if(event.key==='Home'){
      event.preventDefault();
      if(!event.repeat){reset();home();}
      return;
    }
    const key=event.key==='+'?'=':event.key;
    if(!keys.has(key))return;
    event.preventDefault();
    if(held.has(key) || event.repeat)return;
    wheelZoom=0;interrupt();keyTravel(key,8);held.set(key,performance.now()+8);wake();
  },{signal});
  canvas.addEventListener('keyup',event=>{
    const key=event.key==='+'?'=':event.key;
    const since=held.get(key);
    if(since===undefined)return;
    keyTravel(key,performance.now()-since);held.delete(key);wake();
  },{signal});
  canvas.addEventListener('blur',reset,{signal});
  canvas.ownerDocument.defaultView?.addEventListener('blur',reset,{signal});
  return {active,step,reset};
}
