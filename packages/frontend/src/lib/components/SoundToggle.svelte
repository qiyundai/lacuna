<script lang="ts">
  import IconAction from './IconAction.svelte';
  import Icon from './Icon.svelte';
  import { toggleValleySound, valleyPlayback } from '$lib/valley-playback.svelte.js';
  /*
   * The one master sound switch. Rendered wherever valley audio can be
   * playing so it is always one tap away: the masthead, the loading screen
   * and the open journal page. `surface` matches the background it sits on.
   */
  let { surface = 'scene' }: { surface?: 'scene' | 'paper' } = $props();
  const on = $derived(!valleyPlayback.muted);
</script>

{#if surface === 'scene'}
  <IconAction icon="volume" label="Sound" tone="solid" labelled={false} pressed={on} onclick={() => toggleValleySound('muted')}/>
{:else}
  <button type="button" class="paper-control" aria-label="Sound" aria-pressed={on} title={on ? 'Sound on' : 'Sound off'}
    onclick={() => toggleValleySound('muted')}><Icon name="volume" off={!on}/></button>
{/if}
