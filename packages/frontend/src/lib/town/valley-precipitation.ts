import * as T from 'three';
import { archiveShelter } from './rain-archive.js';
import { conservatoryShelter } from './monument-winter-garden.js';
import type { ValleyWeather } from './valley-weather.js';

const precipitationLayer = 1;

function particles(snow: boolean) {
  const position: number[] = [], sample: number[] = [];
  const count = snow ? 3800 : 4800, near = snow ? 1150 : 1500;
  let seed = snow ? 8182 : 4321;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let i = 0; i < count; i++) {
    const x = random(), y = random(), z = random();
    const speed = random(), opacity = random(), tier = Number(i >= near);
    for (let tip = 0; tip < (snow ? 1 : 2); tip++) {
      position.push(x, y, z);
      sample.push(speed, opacity, tier, tip);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3));
  geometry.setAttribute('particle', new T.Float32BufferAttribute(sample, 4));
  return geometry;
}

export function createValleyPrecipitation(camera: T.PerspectiveCamera, daylight: T.IUniform<number>) {
  camera.layers.enable(precipitationLayer);
  const layer = new T.Group();
  const time = { value: 0 };
  const pixels = { value: 720 };
  const archivePresent = { value: false }, gardenPresent = { value: false };
  const worldToArchive = { value: new T.Matrix4() }, worldToGarden = { value: new T.Matrix4() };

  function roofSpace(model: T.Object3D | undefined, active: T.IUniform<boolean>, inverse: T.IUniform<T.Matrix4>) {
    active.value = Boolean(model);
    if (!model) return;
    model.updateWorldMatrix(true, false);
    inverse.value.copy(model.matrixWorld).invert();
  }

  function material(snow: boolean) {
    return new T.ShaderMaterial({
      uniforms: { time, pixels, daylight, archivePresent, gardenPresent, worldToArchive, worldToGarden, amount: { value: 0 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        uniform float time, pixels, amount;
        uniform bool archivePresent, gardenPresent;
        uniform mat4 worldToArchive, worldToGarden;
        attribute vec4 particle;
        varying float opacity, tip;
        ${archiveShelter.source}
        ${conservatoryShelter.source}

        void main() {
          vec3 dimensions = mix(vec3(76., 62., 76.), vec3(254., 175., 254.), particle.z);
          vec3 speed = ${snow ? 'vec3(1.14, -1.75, .54)' : 'vec3(2.7, -19., 1.14)'} * mix(.72, 1.27, particle.x);
          vec3 center = cameraPosition + vec3(0., 8., 0.);
          vec3 drift = speed * time;
          ${snow ? 'drift.xz += sin(time * (.7 + particle.x) + position.xz * 71.) * .50;' : ''}
          vec3 offset = mod(position * dimensions + drift - center + dimensions * .5, dimensions) - dimensions * .5;
          vec3 p = center + offset;
          vec3 edge = abs(offset) / dimensions * 2.;
          float bounds = 1. - smoothstep(.74, .99, max(edge.x, max(edge.y, edge.z)));
          float distanceToEye = length(p - cameraPosition);
          float nearby = smoothstep(2.2, 7.5, distanceToEye);
          float layerFade = mix(1., smoothstep(23., 43., distanceToEye), particle.z);
          opacity = bounds * nearby * layerFade * smoothstep(particle.y - .16, particle.y + .12, amount) * sqrt(amount);
          tip = particle.w;
          if (archivePresent) opacity *= archiveExposure((worldToArchive * vec4(p, 1.)).xyz);
          if (gardenPresent) opacity *= conservatoryExposure((worldToGarden * vec4(p, 1.)).xyz);
          ${snow ? '' : 'p -= speed * tip * mix(.019, .049, particle.x) * mix(1., 1.45, particle.z);'}
          vec4 view = viewMatrix * vec4(p, 1.);
          gl_Position = opacity < .002 ? vec4(2., 2., 2., 1.) : projectionMatrix * view;
          ${snow ? 'gl_PointSize = clamp(pixels * mix(.055, .154, particle.x) / max(1., -view.z), 1.4, 6.);' : ''}
        }`,
      fragmentShader: `
        uniform float daylight;
        varying float opacity, tip;
        void main() {
          float shape = ${snow ? '1. - smoothstep(.12, .5, length(gl_PointCoord - .5))' : 'smoothstep(0., .22, tip) * (1. - smoothstep(.59, 1., tip))'};
          vec3 silver = mix(vec3(.29, .35, .42), vec3(.64, .72, .75), daylight);
          gl_FragColor = vec4(silver, shape * opacity * ${snow ? '.72' : '.36'});
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
  }

  const rain = new T.LineSegments(particles(false), material(false));
  const snow = new T.Points(particles(true), material(true));
  rain.name = 'Valley rain';
  snow.name = 'Valley snow';
  for (const object of [rain, snow]) {
    object.layers.set(precipitationLayer);
    object.frustumCulled = false;
    object.visible = false;
    object.renderOrder = 5;
    layer.add(object);
  }
  return {
    layer,
    resize(height: number) { pixels.value = height; },
    shelter(archive?: T.Object3D, garden?: T.Object3D) {
      roofSpace(archive, archivePresent, worldToArchive);
      roofSpace(garden, gardenPresent, worldToGarden);
    },
    update(seconds: number, weather: ValleyWeather) {
      time.value = seconds;
      rain.visible = weather.rain > .005;
      rain.material.uniforms.amount!.value = weather.rain;
      snow.visible = weather.snow > .005;
      snow.material.uniforms.amount!.value = weather.snow;
    },
    dispose() {
      for (const object of [rain, snow]) {
        object.geometry.dispose();
        object.material.dispose();
      }
    }
  };
}
