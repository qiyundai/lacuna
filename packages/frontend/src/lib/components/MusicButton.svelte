<script lang="ts">
  import { tick } from 'svelte';
  import { musicWindow } from '$lib/music-window.svelte.js';

  let {opener}:{opener:()=>HTMLButtonElement}=$props();

  async function openAlbum() {
    musicWindow.opener = opener();
    musicWindow.mode = 'library';
    await tick();
    document.getElementById('soundtrack')?.focus({ preventScroll: true });
  }
</script>

<button type="button" onclick={openAlbum} aria-controls="soundtrack" aria-expanded={musicWindow.mode !== 'closed'}>Music</button>
