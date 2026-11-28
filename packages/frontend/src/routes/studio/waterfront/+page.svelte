<script lang="ts">
  import { studioLightBudget } from '$lib/town/light-budget.js';
  import { studioWeather } from '$lib/town/valley-weather.js';
  import { studioHour } from '$lib/town/city-clock.js';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { studioHomes } from './studio-homes.js';
  import JournalCity from '$lib/components/JournalCity.svelte';
</script>

<svelte:head><title>Example city · Lacuna</title></svelte:head>
{#key page.url.search}
  <JournalCity guest readOnly exampleHomes={studioHomes} lightBudget={studioLightBudget(page.url.searchParams.get('lights'))} fixedHour={studioHour(page.url.searchParams.get('time'))} weatherPreview={studioWeather(page.url.searchParams.get('weather'))} afterglow={page.url.searchParams.get('light')==='afterglow'} onExit={() => goto('/')}/>
{/key}
