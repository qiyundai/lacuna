<script lang="ts">
  import IconAction from './IconAction.svelte';
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

<IconAction icon="library" label="Music library" onclick={openAlbum} controls="soundtrack" expanded={musicWindow.mode !== 'closed'}/>
