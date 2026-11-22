import * as T from 'three';
import { localHour,onLocalMinute } from './city-clock.js';
import type { Gouache } from './gouache.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFerryHallKit } from './ferry-hall.js';
import { createTideHouseKit } from './tide-house.js';

export function openBuildingStudy(canvas: HTMLCanvasElement, model: 'tide-house' | 'ferry-hall', paint?: Gouache) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new T.Scene();
  const room = new RoomEnvironment();
  const generator = new T.PMREMGenerator(renderer);
  const reflections = generator.fromScene(room, .04);
  room.dispose();
  generator.dispose();
  scene.environment = reflections.texture;
  scene.environmentIntensity = .22;
  scene.background = new T.Color('#304748');
  const haze = new T.FogExp2('#304748', .012);
  scene.fog = haze;
  const camera = new T.PerspectiveCamera(32, 1, .1, 300);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minPolarAngle = .15;
  controls.maxPolarAngle = Math.PI * .495;
  controls.minDistance = 4;
  const sun = new T.DirectionalLight('#ffd7a7', 2.85);
  sun.position.set(-13, 22, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = .018;
  sun.shadow.bias = -.00018;
  sun.shadow.intensity = .79;
  sun.shadow.camera.far = 90;
  scene.add(sun, sun.target, new T.HemisphereLight('#deeeed', '#927459', .78));
  const rim = new T.DirectionalLight('#b1d7e9', 1.15);
  rim.position.set(7, 11, -10);
  scene.add(rim);
  const ground = new T.Mesh(new T.PlaneGeometry(300, 300), new T.MeshStandardMaterial({color: '#455955', roughness: 1}));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = model === 'ferry-hall' ? -.65 : 0;
  ground.receiveShadow = true;
  scene.add(ground);

  const composer = renderer.extensions.has('EXT_color_buffer_float') ? new EffectComposer(renderer) : undefined;
  if (composer) {
    const occlusion = new GTAOPass(scene, camera);
    occlusion.updateGtaoMaterial({radius: .64, thickness: .72, samples: 12});
    occlusion.blendIntensity = .82;
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(occlusion);
    composer.addPass(new OutputPass());
  }
  const clockHour={value:localHour()};
  const kit = model === 'ferry-hall' ? createFerryHallKit(paint,false,clockHour) : createTideHouseKit(paint);
  let building: T.Group | undefined;
  let height = 1, radius = 1;
  const bounds = new T.Box3();
  let frame = 0;
  camera.position.set(6, 3.05, 10);
  function draw() {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      clockHour.value=localHour();
      if (composer) composer.render();
      else renderer.render(scene, camera);
    });
  }
  function frameModel() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || bounds.isEmpty()) return;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const direction = camera.position.clone().sub(controls.target).normalize();
    const right = new T.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new T.Vector3().crossVectors(direction, right);
    const vertical = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    const horizontal = vertical * camera.aspect;
    bounds.getCenter(controls.target);
    let distance = controls.minDistance;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const delta = new T.Vector3(x, y, z).sub(controls.target);
      const extent = Math.max(Math.abs(delta.dot(right)) / horizontal, Math.abs(delta.dot(up)) / vertical);
      distance = Math.max(distance, delta.dot(direction) + extent * 1.16);
    }
    haze.density = .23 / distance;
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.maxDistance = distance * 2.5;
    controls.update();
    draw();
  }
  function setCount(count: number) {
    if (building) scene.remove(building);
    building = kit.build(count);
    scene.add(building);
    bounds.setFromObject(building);
    bounds.min.y = ground.position.y;
    const size = bounds.getSize(new T.Vector3());
    height = bounds.max.y;
    radius = Math.hypot(size.x, size.z) * .55;
    const shadowExtent = Math.max(9, height * .77, radius + 1);
    Object.assign(sun.shadow.camera, {left: -shadowExtent, right: shadowExtent, top: shadowExtent, bottom: -shadowExtent});
    sun.shadow.camera.updateProjectionMatrix();
    sun.position.set(-13, 22 + height / 2, 15);
    sun.target.position.set(0, height / 2, 0);
    frameModel();
  }
  function turn(angle: number) {
    controls.rotateLeft(angle);
    controls.update();
  }
  function keydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowLeft': turn(.16); break;
      case 'ArrowRight': turn(-.16); break;
      case 'ArrowUp': controls.rotateUp(.11); break;
      case 'ArrowDown': controls.rotateUp(-.11); break;
      case '+': case '=': controls.dollyIn(.86); break;
      case '-': controls.dollyOut(.86); break;
      case 'Home': frameModel(); break;
      default: return;
    }
    event.preventDefault();
    controls.update();
  }
  controls.addEventListener('change', draw);
  canvas.addEventListener('keydown', keydown);
  const observer = new ResizeObserver(frameModel);
  observer.observe(canvas);
  const refreshClock=()=>{if(!document.hidden)draw();};
  const stopClock=model==='ferry-hall'?onLocalMinute(refreshClock):undefined;
  document.addEventListener('visibilitychange',refreshClock);
  return { setCount, turn, dispose() {
    stopClock?.();document.removeEventListener('visibilitychange',refreshClock);
    observer.disconnect();
    controls.removeEventListener('change', draw);
    controls.dispose();
    canvas.removeEventListener('keydown', keydown);
    cancelAnimationFrame(frame);
    kit.dispose();
    paint?.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    sun.shadow.dispose();
    reflections.dispose();
    composer?.passes.forEach(pass => pass.dispose());
    composer?.dispose();
    renderer.dispose();
  }};
}
