<script lang="ts">
  import { studioHour } from '$lib/town/city-clock.js';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import JournalCity from '$lib/components/JournalCity.svelte';
</script>

<svelte:head><title>Example city · Lacuna</title></svelte:head>
{#key page.url.search}
  <JournalCity guest readOnly fixedHour={studioHour(page.url.searchParams.get('time'))} afterglow={page.url.searchParams.get('light')==='afterglow'} onExit={() => goto('/')}/>
{/key}
