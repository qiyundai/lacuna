import { MathUtils, Vector3, type Camera } from 'three';
import { bankEdge, inValley, valleyOrigin } from './valley-river.js';

type Loop = 'river' | 'breeze' | 'leaves' | 'insects' | 'street' | 'engine' | 'wash';
type Cue = 'songbird' | 'gull' | 'dock';
type Clip = Loop | `${Cue}-a` | `${Cue}-b`;
export type SoundPlace = { id: string; position: Vector3; kind: 'grove' | 'street' | 'dock'; level: number };
export type SoundFerry = { position: Vector3; visible: boolean; speed: number };
type Source = { key: string; clip: Clip; position?: Vector3; level: number; range: number; score: number };

export function cameraListenerPose(camera: Camera, eye: Vector3, forward: Vector3, up: Vector3) {
  eye.setFromMatrixPosition(camera.matrixWorld);
  forward.setFromMatrixColumn(camera.matrixWorld, 2).negate().normalize();
  up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
}

/** Distance takes the top off a sound before it takes the level: far calls arrive soft and rounded. */
export function airCutoff(distance: number, range: number) {
  return 16000 * (2200 / 16000) ** MathUtils.clamp(distance / range, 0, 1);
}

export function createValleySound(context: AudioContext, refresh: () => void) {
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  const abort = new AbortController();
  const buffers = new Map<Clip, AudioBuffer>();
  const requested = new Set<Clip>();
  const eye = new Vector3(), forward = new Vector3(), up = new Vector3();
  const voices = new Map<string, ReturnType<typeof start>>();
  const live = new Set<ReturnType<typeof start>>();
  let enabled = false, reading = false, nextCall = 0, nextMix = 0;
  const listener = context.listener;
  context.addEventListener('statechange', refresh, { signal: abort.signal });

  async function load(clip: Clip) {
    if (requested.has(clip)) return;
    requested.add(clip);
    try {
      const file = await fetch('/valley-sounds/' + clip + '.mp3', { signal: abort.signal });
      if (!file.ok) return;
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      if (!abort.signal.aborted) { buffers.set(clip, buffer); refresh(); }
    } catch {}
  }

  function start(source: Source, buffer: AudioBuffer, loop: boolean, offset=0) {
    const node = context.createBufferSource(), gain = context.createGain();
    const pan = source.position ? context.createPanner() : undefined;
    const air = source.position ? context.createBiquadFilter() : undefined;
    node.buffer = buffer; node.loop = loop;
    if (pan && air) {
      pan.panningModel = 'HRTF'; pan.distanceModel = 'linear';
      pan.refDistance = source.range * .12; pan.maxDistance = source.range;
      pan.setPosition(source.position!.x, source.position!.y, source.position!.z);
      air.type = 'lowpass'; air.Q.value = .5;
      air.frequency.value = airCutoff(source.position!.distanceTo(eye), source.range);
      node.connect(air).connect(pan).connect(gain);
    } else node.connect(gain);
    gain.gain.value = loop ? 0 : source.level;
    gain.connect(master);
    const voice = { node, gain, pan, air, loop };
    node.onended = () => {
      node.disconnect(); air?.disconnect(); pan?.disconnect(); gain.disconnect(); live.delete(voice);
      if (voices.get(source.key) === voice) voices.delete(source.key);
      if (!abort.signal.aborted) refresh();
    };
    node.start(0, loop ? Math.random() * buffer.duration : offset);
    live.add(voice); voices.set(source.key, voice);
    return voice;
  }

  function fade(key: string) {
    const voice = voices.get(key);
    if (!voice) return;
    voices.delete(key);
    voice.gain.gain.setTargetAtTime(0, context.currentTime, .055);
    voice.node.stop(context.currentTime + .25);
  }

  function apply(source: Source, loop: boolean) {
    const buffer = buffers.get(source.clip);
    if (!buffer) { void load(source.clip); return; }
    let voice = voices.get(source.key);
    if (!voice) {
      if (live.size >= 12) return;
      voice = start(source, buffer, loop);
    }
    const p = source.position;
    if (voice.pan && p) voice.pan.setPosition(p.x, p.y, p.z);
    if (voice.air && p) voice.air.frequency.setTargetAtTime(airCutoff(p.distanceTo(eye), source.range), context.currentTime, .2);
    voice.gain.gain.setTargetAtTime(source.level, context.currentTime, loop ? .16 : .02);
  }

  function mix(isEnabled: boolean, pageOpen: boolean) {
    if (enabled === isEnabled && reading === pageOpen) return;
    enabled = isEnabled; reading = pageOpen;
    if (enabled) master.gain.setTargetAtTime(reading ? 10 ** (-8 / 20) : 1, context.currentTime, .09);
    else { master.gain.cancelScheduledValues(context.currentTime); master.gain.value = 0; }
    for (const [key, voice] of voices) if (!enabled || (reading && !voice.loop)) fade(key);
    if (enabled) {
      void load('dock-a');
      nextCall = context.currentTime + 2 + Math.random() * 4;
    }
  }

  function settle(position:Vector3){
    const buffer=buffers.get('dock-a');
    if(!buffer || !enabled || reading || context.state!=='running')return;
    start({key:'settling',clip:'dock-a',position,range:180,level:.34,score:1},buffer,false,.027);
  }

  function update(camera: Camera, daylight: number, paused: boolean, places: readonly SoundPlace[],
    ferries: readonly SoundFerry[], flocks: readonly Vector3[], terrain: (x:number,z:number)=>number,
    cover: (x:number,z:number,y:number)=>number) {
    if (!enabled || context.state !== 'running') return;
    cameraListenerPose(camera, eye, forward, up);
    listener.setPosition(eye.x, eye.y, eye.z);
    listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    if (!paused && context.currentTime < nextMix) return;
    nextMix = context.currentTime + .08;
    const loops: Source[] = [], cues: Source[] = [];
    function source(key: string, clip: Clip, position: Vector3 | undefined, level: number, range: number) {
      const distance = position ? position.distanceTo(eye) : 0;
      const score = level * (1 - MathUtils.clamp((distance / range - .12) / .88, 0, 1));
      return { key, clip, position, level, range, score };
    }
    function loop(key: string, clip: Loop, p: Vector3 | undefined, volume: number, range: number) {
      const item = source(key, clip, p, volume, range);
      if (item.score > .004) loops.push(item);
    }
    function cue(kind: Cue, p: Vector3, level: number, range: number) {
      const variant = Math.random() < .5 ? 'a' : 'b';
      const item = source(kind, `${kind}-${variant}`, p, level, range);
      if (item.score > .04) cues.push(item);
    }
    const due = !paused && !reading && context.currentTime >= nextCall;
    const altitude = Math.max(0, eye.y);
    loop('wind', 'breeze', undefined, .075 + .16 * MathUtils.smoothstep(altitude, 14, 125), 1);
    const station = valleyOrigin.z - eye.z;
    const river: Source[] = [];
    for (let cell = Math.round(station / 32) - 2; cell <= Math.round(station / 32) + 2; cell++) {
      for (const bank of [0, 1] as const) {
        const p = inValley(new Vector3(cell * 32, .2, bankEdge(cell * 32, bank)));
        river.push(source('bank-' + cell + '-' + bank, 'river', p, .42, 108));
      }
    }
    const nearest = (a: Source,b: Source) => b.score - a.score;
    loops.push(...river.sort(nearest).slice(0, 2).filter(s => s.score > .004));
    const groves: SoundPlace[] = [];
    for (let x = Math.round(eye.x / 32) - 1; x <= Math.round(eye.x / 32) + 1; x++) {
      for (let z = Math.round(eye.z / 32) - 1; z <= Math.round(eye.z / 32) + 1; z++) {
        const y = terrain(x * 32, z * 32);
        if (cover(x * 32, z * 32, y) > .46)
          groves.push({ id: x + ',' + z, kind: 'grove', position: new Vector3(x * 32,y + 4,z * 32), level: 1 });
      }
    }
    let street: SoundPlace | undefined, grove: SoundPlace | undefined, dock: SoundPlace | undefined;
    for (const place of [...places,...groves]) {
      const previous = place.kind === 'street' ? street : place.kind === 'dock' ? dock : grove;
      if (previous && previous.position.distanceToSquared(eye) <= place.position.distanceToSquared(eye)) continue;
      if (place.kind === 'street') street = place;
      else if (place.kind === 'dock') dock = place;
      else grove = place;
    }
    // Insects and leaves live at ground level: they belong to a walker, not to a view from above.
    const clearance = Math.max(0, eye.y - terrain(eye.x, eye.z));
    const underfoot = 1 - MathUtils.smoothstep(clearance, 5, 24);
    const canopy = 1 - MathUtils.smoothstep(clearance, 14, 60);
    if (grove) {
      loop('leaves-' + grove.id, 'leaves', grove.position, .34 * canopy, 70);
      loop('insects-' + grove.id, 'insects', grove.position, .14 * (1 - daylight) * underfoot, 32);
      if (due && daylight > .3) cue('songbird', grove.position, .5 * (.35 + .65 * canopy), 96);
    }
    if (street) loop('street-' + street.id, 'street', street.position, street.level * (.45 + .55 * daylight), 72);
    if (due && dock) cue('dock', dock.position, .57, 69);
    if (due && Math.random() < .35) for (const p of flocks) cue('gull', p, .26, 130);
    if (!paused) ferries.forEach((boat,i) => {
      if (!boat.visible) return;
      loop('engine-' + i, 'engine', boat.position, .12 + .49 * boat.speed, 144);
      loop('wash-' + i, 'wash', boat.position, .48 * boat.speed, 87);
    });
    const chosen = loops.sort(nearest).slice(0, 10);
    for (const [key,voice] of voices) {
      if (voice.loop ? !chosen.some(s => s.key === key) : paused && key!=='settling') fade(key);
      else if (key === 'gull' && voice.pan && callingGull && flocks.includes(callingGull)) {
        voice.pan.setPosition(callingGull.x, callingGull.y, callingGull.z);
        voice.air?.frequency.setTargetAtTime(airCutoff(callingGull.distanceTo(eye), 130), context.currentTime, .2);
      }
    }
    for (const item of chosen) apply(item, true);
    if (due) {
      nextCall = context.currentTime + 5 + Math.random() * 9;
      const item = cues.sort(nearest)[Math.floor(Math.random() * Math.min(2,cues.length))];
      if (item) {
        if (item.key === 'gull') callingGull = item.position;
        apply(item,false);
        if (!buffers.has(item.clip)) nextCall = context.currentTime + 1;
      }
    }
  }
  let callingGull: Vector3 | undefined;
  return { mix, update, settle, destroy() {
    abort.abort();
    for (const voice of live) {
      voice.node.onended = null; voice.node.stop(); voice.node.disconnect();
      voice.air?.disconnect(); voice.pan?.disconnect(); voice.gain.disconnect();
    }
    live.clear(); voices.clear(); buffers.clear(); master.disconnect();
  }};
}
