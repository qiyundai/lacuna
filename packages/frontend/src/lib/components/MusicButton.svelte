<script lang="ts">
  import { tick } from 'svelte';
  import { musicWindow } from '$lib/music-window.svelte.js';

  async function openAlbum(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
    musicWindow.opener = event.currentTarget;
    musicWindow.mode = 'library';
    await tick();
    document.getElementById('soundtrack')?.focus({ preventScroll: true });
  }
</script>

<button type="button" class="music-button" onclick={openAlbum} aria-label="Music" title="Music"
  aria-controls="soundtrack" aria-expanded={musicWindow.mode !== 'closed'}>
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
    <path d="M8 17V6l11-2v11M8 9l11-2"/>
    <ellipse cx="5.5" cy="17.5" rx="2.5" ry="2"/><ellipse cx="16.5" cy="15.5" rx="2.5" ry="2"/>
  </svg>
</button>

<style>
  .music-button{display:inline-grid;place-items:center;min-width:44px;min-height:44px;padding:0;color:inherit;background:transparent;border:0;border-radius:50%;cursor:pointer}
  .music-button:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
</style>
