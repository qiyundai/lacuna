<script lang="ts">
  import { onMount, tick } from 'svelte';

  const tracks = [
    'Where the River Enters', 'The Trees Lean In', 'Rooms Above the Quay',
    'Gulls Beyond the Wall', 'Ink Beneath the Water', 'Weather Inside the Moss',
    'The Windows Keep Their Light', 'Back to the First Bend'
  ];

  let dialog: HTMLDialogElement;
  let audio: HTMLAudioElement;
  let index = $state(0);
  let error = $state('');
  let src = $derived('/music/' + tracks[index].toLowerCase().replaceAll(' ', '-') + '.m4a');

  onMount(() => { audio.volume = 0.45; });

  async function playTrack(next: number) {
    index = next;
    error = '';
    await tick();
    try {
      await audio.play();
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) error = 'Playback paused. Press play to try again.';
    }
  }
</script>

<dialog bind:this={dialog} id="soundtrack" aria-labelledby="album-title">
  <header>
    <h2 id="album-title">A River Remembers</h2>
    <button type="button" aria-label="Close music" onclick={() => dialog.close()}>×</button>
  </header>
  <select aria-label="Album track" value={index} onchange={event => playTrack(Number(event.currentTarget.value))}>
    {#each tracks as track, i}<option value={i}>{i + 1}. {track}</option>{/each}
  </select>
  <audio bind:this={audio} {src} controls preload="none" aria-label={tracks[index]}
    onplaying={() => error = ''} onerror={() => error = 'This track could not load. Choose another track or try again.'}
    onended={() => playTrack((index + 1) % tracks.length)}></audio>
  {#if error}<p role="status">{error}</p>{/if}
</dialog>

<style>
  dialog{width:min(23rem,calc(100vw - 2rem));padding:1rem 1.25rem 1.25rem;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink)}
  dialog::backdrop{background:#10231e66}
  header{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.75rem}
  h2{font:400 1.8rem/1.1 var(--font-reading);margin:0}
  button{min-height:44px;min-width:44px;border:0;background:transparent;font-size:1.6rem;color:inherit;cursor:pointer}
  select{width:100%;min-height:44px;padding:.4rem .6rem;background:transparent;color:inherit;border:1px solid var(--line);border-radius:4px;font:inherit}
  audio{display:block;width:100%;margin-top:1rem}
  p{font-size:.9rem;margin:.75rem 0 0}
</style>
