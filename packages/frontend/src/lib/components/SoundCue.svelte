<script lang="ts">
  import Icon from './Icon.svelte';
  import { willPlaySound } from '$lib/valley-playback.svelte.js';
  /*
   * Inline notice on an action that will start valley audio. Shown only when
   * sound will actually play; it is decorative, so the action's accessible
   * name must also say "with sound". Sized from the surrounding text and
   * spaced by the parent's flex gap.
   */
</script>

{#if willPlaySound()}<span class="sound-cue" aria-hidden="true"><Icon name="volume"/></span>{/if}

<style>
  .sound-cue{display:inline-flex;--icon-size:1.15em;opacity:.8}
</style>
