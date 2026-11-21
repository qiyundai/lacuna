<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import JournalCity from '$lib/components/JournalCity.svelte';
  import MusicButton from '$lib/components/MusicButton.svelte';
</script>

<svelte:head><title>The valley city · Lacuna</title></svelte:head>
<div class="studio-music"><MusicButton/></div>
{#key page.url.searchParams.get('light')}<JournalCity guest afterglow={page.url.searchParams.get('light')==='afterglow'} onExit={() => goto('/')}/>{/key}

<style>
  .studio-music{position:fixed;left:var(--gutter);top:4.5rem;z-index:2;border-radius:50%;background:#242833d9;color:#fff6e9}
</style>
