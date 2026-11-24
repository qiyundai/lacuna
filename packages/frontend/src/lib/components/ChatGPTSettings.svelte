<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/modal.js';
  import ReflectionAccount from './ReflectionAccount.svelte';
  import ReflectionPrivacy from './ReflectionPrivacy.svelte';
  import { aiAvailable } from '$lib/ai-release.js';
  let { show = $bindable(false), billingReturn=$bindable('') }: { show: boolean; billingReturn?:string } = $props();
</script>
{#if show}
  <div class="sheet-screen" style:z-index="210" use:modal={{ dismiss: () => show = false }} role="dialog" aria-modal="true" aria-label="AI reflections" tabindex="-1"
    onclick={(event) => { if (event.target === event.currentTarget) show = false; }} onkeydown={(event) => { if (event.key === 'Escape') show = false; }} transition:fade={{ duration: 400, easing: cubicOut }}>
    <div class="journal-sheet">
      <h2>{aiAvailable ? 'Reflections' : 'Reflections is coming soon'}</h2>
      {#if aiAvailable}
        <ReflectionAccount bind:billingReturn/>
      {:else}
        <ReflectionPrivacy/>
        {#if billingReturn}<a class="atlas-link" href="/billing">Manage existing billing</a>{/if}
      {/if}
      <div class="sheet-foot"><button class="atlas-link" onclick={() => show = false}>Return</button></div>
    </div>
  </div>
{/if}
