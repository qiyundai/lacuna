<script lang="ts">
  import IconAction from './IconAction.svelte';
  import { musicWindow, openListeningRoom } from '$lib/music-window.svelte.js';

  let {opener}:{opener:()=>HTMLButtonElement}=$props();
</script>

<IconAction icon="library" label="Music" onclick={() => openListeningRoom(opener())} controls="soundtrack" expanded={musicWindow.mode === 'room'}/>
