<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import { musicWindow, openListeningRoom } from '$lib/music-window.svelte.js';
  import { valleyPlayback } from '$lib/valley-playback.svelte.js';
  /*
   * One line of scene type naming the song. It arrives at full strength when
   * the song changes, then settles to a whisper; hover or focus brings it back.
   * Hidden whenever the soundtrack can't be heard (sound or soundtrack off).
   */
  const now = $derived(musicWindow.now);
  const audible = $derived(valleyPlayback.music && !valleyPlayback.muted);
  let settled = $state(false);
  $effect(() => {
    void now?.title; void musicWindow.playing;
    settled = false;
    const timer = setTimeout(() => settled = true, 6000);
    return () => clearTimeout(timer);
  });
</script>

{#if now && audible}
  <div class="now-playing" class:settled class:still={!musicWindow.playing} transition:fade={{ duration: 600, easing: cubicOut }}>
    <button type="button" class="song" aria-label={`Music: ${now.title}, from ${now.album}. Open music`}
      onclick={event => openListeningRoom(event.currentTarget)}>
      <span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="title">{now.title}</span>
      <span class="album">{now.album}</span>
    </button>
    <button type="button" class="toggle" aria-label={musicWindow.playing ? 'Pause music' : 'Play music'} onclick={() => musicWindow.toggle()}>
      <Icon name={musicWindow.playing ? 'pause' : 'play'}/>
    </button>
  </div>
{/if}

<style>
  .now-playing {
    display: flex;
    align-items: center;
    min-width: 0;
    max-width: min(30rem, 100%);
    color: var(--scene-ink);
    text-shadow: var(--scene-type-shadow);
    pointer-events: auto;
    transition: opacity var(--dur-slow) var(--ease-soft);
  }
  .settled:not(:hover, :focus-within) { opacity: .6; }
  button { flex: none; display: inline-flex; align-items: center; min-height: var(--control); padding: 0; border: 0; background: none; color: inherit; cursor: pointer; }
  button:focus-visible { outline-color: var(--scene-focus); }
  .song { flex: 0 1 auto; min-width: 0; gap: var(--space-3); font: 400 var(--ui-md)/1.3 var(--font); letter-spacing: var(--ls-ui); text-align: left; }
  .title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: underline; text-decoration-color: transparent; text-underline-offset: .35em; transition: text-decoration-color var(--dur-micro) var(--ease-soft); }
  .song:hover .title { text-decoration-color: color-mix(in srgb, currentColor 50%, transparent); }
  .album { flex: none; font-size: var(--ui-sm); color: var(--scene-ink-muted); white-space: nowrap; }
  .album::before { content: '·'; margin-inline: .5em .55em; }
  .toggle { justify-content: center; inline-size: var(--control); --icon-size: var(--icon-sm); }
  .toggle > :global(svg) { filter: drop-shadow(0 1px 2px var(--scene-shade)); }

  .bars { flex: none; display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; }
  .bars i { width: 2px; height: 100%; border-radius: 1px; background: currentColor; box-shadow: 0 0 3px var(--scene-shade); transform-origin: bottom; transform: scaleY(.35); }
  @media (prefers-reduced-motion: no-preference) {
    .now-playing:not(.still) .bars i { animation: sway 1.1s ease-in-out infinite alternate; }
    .bars i:nth-child(2) { animation-delay: -.45s; } .bars i:nth-child(3) { animation-delay: -.8s; }
    @keyframes sway { from { transform: scaleY(.3); } to { transform: scaleY(1); } }
  }
  /* Narrow screens keep the song and drop the album, leaving room for the write caption */
  @media (max-width: 600px) { .album { display: none; } }
</style>
