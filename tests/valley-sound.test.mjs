import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { airCutoff, cameraListenerPose, createValleySound } from '../packages/frontend/src/lib/town/valley-sound.ts';
import { FerryCourse } from '../packages/frontend/src/lib/town/ferry-course.ts';
import { inValley, valleyOrigin } from '../packages/frontend/src/lib/town/valley-river.ts';

test('the listener follows camera rotation, translation and roll in world space', () => {
  const rig = new Group(), camera = new PerspectiveCamera();
  rig.position.set(64, 2, 117);
  rig.add(camera);
  camera.position.set(0, 4, 8);
  const eye = new Vector3(), forward = new Vector3(), up = new Vector3();
  const emitter = new Vector3(70, 6, 125);
  function rightwardDistance() {
    rig.updateMatrixWorld(true);
    cameraListenerPose(camera, eye, forward, up);
    return emitter.clone().sub(eye).dot(forward.clone().cross(up));
  }
  assert.equal(rightwardDistance(), 6);
  assert.deepEqual(eye.toArray(), [64, 6, 125]);
  rig.rotation.y = Math.PI;
  assert.ok(rightwardDistance() < -5.99);
  assert.ok(eye.distanceTo(emitter) > 16);
  camera.rotation.z = Math.PI / 2;
  rightwardDistance();
  assert.ok(up.x > .999 && Math.abs(up.dot(forward)) < 1e-9);
});

test('ferry sound and hull share the city transform and come to rest at the berth', () => {
  const course = new FerryCourse(1000, 1, {station: 40, bank: 0, offset: 1, slope: 0});
  const city = new Group();
  city.position.set(valleyOrigin.x, 0, valleyOrigin.z);
  city.rotation.y = Math.PI / 2;
  const arrival = course.clockAt(40, false);
  const berthed = course.sample(arrival + 5);
  assert.equal(berthed.speed, 0);
  assert.equal(berthed.progress, course.sample(arrival + 6).progress);
  const moving = course.sample(arrival + 25);
  assert.equal(moving.speed, 1);
  assert.ok(moving.progress > berthed.progress);
  for (const frame of [berthed, moving]) {
    const p = course.getPointAt(frame.progress);
    assert.ok(inValley(p).distanceTo(city.localToWorld(p.clone())) < 1e-8);
  }
});

test('distance rounds off a sound before it fades, and never past its range', () => {
  assert.equal(airCutoff(0, 130), 16000);
  assert.ok(Math.abs(airCutoff(130, 130) - 2200) < 1e-6);
  assert.equal(airCutoff(400, 130), airCutoff(130, 130));
  assert.ok(airCutoff(30, 130) > airCutoff(60, 130) && airCutoff(60, 130) > airCutoff(100, 130));
});

function stubAudio() {
  const param = () => ({ value: 0, setTargetAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
  const node = extra => ({ connect(next) { return next; }, disconnect() {}, ...extra });
  const playing = new Map();
  const context = {
    state: 'running', currentTime: 10, destination: node(), addEventListener() {},
    listener: { setPosition() {}, setOrientation() {} },
    createGain: () => node({ gain: param() }),
    createPanner: () => node({ setPosition() {} }),
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
    createBufferSource() {
      const source = node({ start() { playing.set(this.buffer.clip, this); }, stop() { playing.delete(this.buffer.clip); } });
      return source;
    },
    async decodeAudioData(data) { return { duration: 12, clip: data.clip }; },
  };
  return { context, playing };
}

test('a completed building plays a positional cue that survives reduced motion and respects the mix', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => ({ok:true,arrayBuffer:async()=>({clip:String(url).split('/').pop().replace('.mp3','')})});
  const {context,playing}=stubAudio();
  const sound=createValleySound(context,()=>{});
  try {
    sound.mix(true,false);
    await new Promise(resolve=>setTimeout(resolve,0));
    const site=new Vector3(3,2,8);
    sound.settle(site);
    assert.ok(playing.has('dock-a'));
    sound.update(new PerspectiveCamera(),1,true,[],[],[],()=>0,()=>0);
    assert.ok(playing.has('dock-a'));
    sound.mix(false,false);
    sound.settle(site);
    assert.equal(playing.has('dock-a'),false);
    sound.mix(true,true);
    sound.settle(site);
    assert.equal(playing.has('dock-a'),false);
  } finally {
    sound.destroy();
    globalThis.fetch=realFetch;
  }
});

test('crickets and leaves belong to the ground, and fall away as the camera climbs', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => ({ ok: true, arrayBuffer: async () => ({ clip: String(url).split('/').pop().replace('.mp3', '') }) });
  try {
    const listen = async height => {
      const { context, playing } = stubAudio();
      const sound = createValleySound(context, () => {});
      const camera = new PerspectiveCamera();
      camera.position.set(0, height, 0); camera.lookAt(0, 0, -20); camera.updateMatrixWorld(true);
      sound.mix(true, false);
      const frame = () => sound.update(camera, 0, true, [], [], [], () => 0, () => 1);
      frame(); await new Promise(r => setTimeout(r, 0)); frame();
      const heard = new Set(playing.keys());
      sound.destroy();
      return heard;
    };
    const ground = await listen(3), above = await listen(32), high = await listen(80);
    assert.ok(ground.has('insects') && ground.has('leaves'));
    assert.ok(!above.has('insects') && above.has('leaves'));
    assert.ok(!high.has('insects') && !high.has('leaves'));
  } finally { globalThis.fetch = realFetch; }
});
