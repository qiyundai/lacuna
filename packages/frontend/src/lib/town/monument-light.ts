import { fadingLightSlots } from './fading-light-slots.js';
import * as T from 'three';
import type { MonumentId } from '../../../../shared/monuments.js';
import type { RoomSource } from './room-light.js';
import { inValley } from './valley-river.js';
import type { ModelTools } from './model-workshop.js';

export function monumentLamps(id:MonumentId,group:T.Group,draw:(builder:(p:ModelTools)=>void)=>T.Group,span:number,rise:number,seed:number) {
  const fixtures:{local:T.Vector3;axis:T.Vector3;reach:number;width:number}[]=[];
  function beam(x:number,y:number,z:number,dx:number,dy:number,dz:number,reach:number,width:number){
    fixtures.push({local:new T.Vector3(x,y,z),axis:new T.Vector3(dx,dy,dz).normalize(),reach,width});
  }
  switch(id){
    case 'post-office':
      beam(-8,26,-7,0,-.35,1,15,8);beam(12,14,7,-.6,-.3,.55,11,5);break;
    case 'bell-yard':
      for(const x of [-6.3,6.3])beam(x,12,4.5,-Math.sign(x),-.40,-.4,12,8);break;
    case 'linen-exchange':
      for(const [z,y,side] of [[0,0,1],[span,rise,-1]]){
        beam(-7.6,y!+16.2,z!,0,-.32,side!,22,9);beam(9.8,y!+25.8,z!,0,-.27,side!,23,10);
      }break;
    case 'winter-garden':
      for(const x of [-6.9,6.9])beam(x,2.1,3.5,-Math.sign(x)*.48,1,-.26,15,8);break;
    case 'tide-organ':
      for(const x of [-11,-2,8])beam(x,11,-.4,0,1,-.16,x<0?18:10,5.3);
      for(const x of [-9,0,9])beam(x,2.1,5.6,0,-.31,1,9,5.2);break;
  }
  const heads=draw(p=>{for(const {local:q} of fixtures){
    p.box('bronze',q.x,q.y-.13,q.z,.65,.25,.63);p.orb('lantern',q.x,q.y,q.z,.26);
  }});
  group.add(heads);
  group.traverse(node=>{
    if(node.name!=='Monument lamp')return;
    node.updateWorldMatrix(true,false);
    const q=group.worldToLocal(node.getWorldPosition(new T.Vector3()));
    beam(q.x,q.y,q.z,0,-.86,.32,5.6,4.5);
  });
  group.updateMatrix();
  const axis=new T.Vector3(0,1,0);
  return fixtures.map(({local,axis:direction,reach,width}):RoomSource=>{
    direction.applyAxisAngle(axis,group.rotation.y);
    return {address:seed,workplace:false,threshold:0,center:inValley(local.applyMatrix4(group.matrix)),
      normal:new T.Vector3(direction.z,direction.y,-direction.x),fixture:{reach,width}};
  });
}

export function monumentLightPool(scene:T.Scene,limit:number) {
  const lights=Array.from({length:limit},()=>new T.PointLight(0xffce8b,0,25,2));
  scene.add(...lights);
  const fades=fadingLightSlots(limit);
  const frustum=new T.Frustum(),clip=new T.Matrix4(),sphere=new T.Sphere(),target=new T.Vector3();
  return {update(sources:readonly RoomSource[],camera:T.Camera,power:number,dt:number){
    frustum.setFromProjectionMatrix(clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const visible=power<=0?[]:sources.flatMap(source=>{
      const fixture=source.fixture;
      if(!fixture||!frustum.intersectsSphere(sphere.set(source.center,fixture.reach+4)))return [];
      return [{source,score:source.center.distanceToSquared(camera.position)/fixture.reach,strength:1}];
    });
    fades.select(visible);
    const changing=fades.advance(dt);
    for(const [i,slot] of fades.slots.entries()){
      const light=lights[i]!,s=slot.source;
      if(!s){light.intensity=0;continue;}
      const reach=s.fixture!.reach;
      target.copy(s.center).addScaledVector(s.normal,reach*.18);
      light.position.copy(target);light.distance=reach*1.8;light.intensity=slot.gain*power*(22+reach*6.5);
    }
    return changing;
  },dispose(){scene.remove(...lights);for(const light of lights)light.dispose();}};
}
