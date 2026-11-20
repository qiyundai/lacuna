<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import JournalCity from '$lib/components/JournalCity.svelte';
</script>

<svelte:head><title>The valley city · Lacuna</title></svelte:head>
{#key page.url.searchParams.get('light')}<JournalCity guest afterglow={page.url.searchParams.get('light')==='afterglow'} onExit={() => goto('/')}/>{/key}
