import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {lightAt,localHour,meteorClock,roomGlow,studioHour} from '../packages/frontend/src/lib/town/city-clock.ts';
import {floorSeed,roomLighting} from '../packages/frontend/src/lib/town/room-light.ts';
import {createBayWorld} from '../packages/frontend/src/lib/town/bay-world.ts';

test('civil hours follow the device across midnight, sleep and timezone changes',()=>{
  const date=new Date(2025,8,18,23,59,59);
  assert.equal(localHour(date),23+59/60+59/3600);
  date.setSeconds(60);
  assert.equal(localHour(date),0);
  date.setHours(7,30,0);
  assert.equal(localHour(date),7.5);
  const zone=process.env.TZ;
  try{
    const instant=new Date('2025-03-09T07:00:00Z');
    process.env.TZ='America/New_York';
    assert.equal(localHour(new Date(instant.getTime()-1000)),1+59/60+59/3600);
    assert.equal(localHour(instant),3);
    process.env.TZ='Asia/Tokyo';
    assert.equal(localHour(instant),16);
  }finally{if(zone===undefined)delete process.env.TZ;else process.env.TZ=zone;}
  assert.deepEqual(lightAt(24),lightAt(0));
  assert.deepEqual(lightAt(-1),lightAt(23));
  assert.deepEqual([4,5,7,18,20].map(h=>lightAt(h).phase),['night','dawn','day','dusk','night']);
  assert.deepEqual(['00:00','12','7:30','24:00','18:60','unlocked',null].map(studioHour),[0,12,7.5,undefined,undefined,undefined,undefined]);
});

test('every room gets a turn and aggregate occupancy follows building use',()=>{
  for(const [hour,expected] of [[3,.08],[12,.10],[20,.65]]){
    const light=lightAt(hour);
    const mean=Array.from({length:1024},(_,i)=>roomGlow(i/1024,false,light)).reduce((a,b)=>a+b,0)/1024;
    assert.ok(Math.abs(mean-expected)<.001);
  }
  assert.ok(lightAt(9).workplace>lightAt(9).residential);
  for(let room=0;room<64;room++){
    const samples=Array.from({length:288},(_,i)=>roomGlow(room/64,false,lightAt(i/12)));
    assert.equal(Math.max(...samples),1);assert.equal(Math.min(...samples),0);
    assert.ok(Math.abs(roomGlow(room/64,false,lightAt(23.999))-roomGlow(room/64,false,lightAt(0)))<.02);
  }
  const floor=new T.Matrix4().makeTranslation(0,2,0);
  assert.equal(floorSeed(123,floor),floorSeed(123,floor.clone()));
  assert.notEqual(floorSeed(123,floor),floorSeed(42,floor));
  assert.notEqual(floorSeed(123,floor),floorSeed(123,new T.Matrix4()));
});

test('meteors count only active night seconds and discard an interrupted streak',()=>{
  const tick=meteorClock(()=>0);
  assert.equal(tick(500,true,false),-1);
  assert.equal(tick(500,false,true),-1);
  assert.equal(tick(119,true,true),-1);
  assert.equal(tick(1,true,true,false),-1);
  assert.equal(tick(.1,true,true,false),-1);
  assert.equal(tick(0,true,true,true),0);
  assert.equal(tick(.2,true,true),.2);
  assert.equal(tick(0,true,false),-1);
  assert.equal(tick(0,true,true),-1);
});

test('a stationary city relights the same scene on a wall clock change',()=>{
  const scene=new T.Scene(),world=createBayWorld(scene);
  try{
    world.setTime(4,0,0,0,lightAt(12));
    const daylight=world.lighting.sky.clone(),sun=world.sun.intensity,objects=scene.children.length;
    world.setTime(4,0,0,0,lightAt(1));
    assert.equal(world.daylight.value,0);
    assert.ok(world.lighting.sky.r<daylight.r && world.sun.intensity<sun);
    assert.equal(scene.children.length,objects);
    world.setTime(4,0,0,0,lightAt(12));
    assert.ok(daylight.equals(world.lighting.sky));assert.equal(world.sun.intensity,sun);
  }finally{world.dispose();}
});

test('near and distant room lighting preserve GLSL directive boundaries',()=>{
  const rooms=roomLighting();
  for(const material of [rooms.glazing,rooms.crystal,rooms.proxy]){
    const shader={...T.ShaderLib.lambert,uniforms:{}};
    material.onBeforeCompile(shader);
    for(const source of [shader.vertexShader,shader.fragmentShader]){
      for(const line of source.split('\n'))if(line.includes('#'))assert.ok(line.trimStart().startsWith('#'),line);
    }
  }
  rooms.dispose();
});
