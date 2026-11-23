import { readLocal, writeLocal } from './storage.js';

export const valleyPlayback = $state({
  active: false,
  muted: false,
  music: true,
  ambience: true
});

let initialized = false;
let context: AudioContext | undefined;

export function readSoundPreferences() {
  if (initialized) return;
  initialized = true;
  valleyPlayback.muted = readLocal('lacuna_valley_muted') === '1';
  valleyPlayback.ambience = readLocal('lacuna_valley_ambience') !== '0';
  try {
    const player = JSON.parse(readLocal('lacuna_music_player') ?? '{}');
    valleyPlayback.music = player?.muted !== true;
  } catch {}
}

export function toggleValleySound(channel: 'muted' | 'ambience' | 'music') {
  valleyPlayback[channel] = !valleyPlayback[channel];
  if (channel !== 'music') writeLocal('lacuna_valley_' + channel, valleyPlayback[channel] ? '1' : '0');
  if (valleyPlayback.active) activateValleyAudio();
}

export function prepareValleyAudio() {
  readSoundPreferences();
  if (!valleyPlayback.ambience || valleyPlayback.muted || typeof AudioContext === 'undefined') return;
  try {
    context ??= new AudioContext();
    if (context.state !== 'running') void context.resume().catch(() => {});
  } catch {}
  return context;
}

export function activateValleyAudio() {
  if (document.hidden || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) return;
  prepareValleyAudio();
  window.dispatchEvent(new Event('lacuna:valley-audio'));
}

export function enterValley() {
  readSoundPreferences();
  valleyPlayback.active = true;
  activateValleyAudio();
}

export function leaveValley() {
  valleyPlayback.active = false;
  window.dispatchEvent(new Event('lacuna:valley-exit'));
  if (context) void context.close().catch(() => {});
  context = undefined;
}

export function valleyAudioContext() { return context; }

/** Whether entering the valley now would start any audio. Reactive in $derived. */
export function willPlaySound() {
  return !valleyPlayback.muted && (valleyPlayback.ambience || valleyPlayback.music);
}
