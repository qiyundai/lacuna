<script lang="ts">
  import { studioHour } from '$lib/town/city-clock.js';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import JournalCity from '$lib/components/JournalCity.svelte';
  import MusicButton from '$lib/components/MusicButton.svelte';
</script>

<svelte:head><title>The valley city · Lacuna</title></svelte:head>
{#key page.url.search}
  <JournalCity guest fixedHour={studioHour(page.url.searchParams.get('time'))} afterglow={page.url.searchParams.get('light')==='afterglow'} onExit={() => goto('/')}>
    {#snippet cityAudio()}<MusicButton/>{/snippet}
  </JournalCity>
{/key}
