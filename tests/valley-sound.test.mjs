import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { cameraListenerPose } from '../packages/frontend/src/lib/town/valley-sound.ts';
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
