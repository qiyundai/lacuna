<script lang="ts">
  import { aiAvailable } from '$lib/ai-release.js';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/modal.js';
  import ReflectionAccount from './ReflectionAccount.svelte';
  let { show = $bindable(false), billingReturn=$bindable('') }: { show: boolean; billingReturn?:string } = $props();
</script>
{#if show}
  <div class="sheet-screen" style:z-index="210" use:modal={{ dismiss: () => show = false }} role="dialog" aria-modal="true" aria-label="AI reflections" tabindex="-1"
    onclick={(event) => { if (event.target === event.currentTarget) show = false; }} onkeydown={(event) => { if (event.key === 'Escape') show = false; }} transition:fade={{ duration: 400, easing: cubicOut }}>
    <div class="journal-sheet">
      <h2>AI reflections</h2>
      {#if !aiAvailable}
        <p class="note soon">Coming soon</p>
        <p>The Soul Map will trace recurring threads in your pages. The Living Memoir will gather them into chapters.</p>
      {:else}
        <ReflectionAccount bind:billingReturn/>
      {/if}
      <div class="sheet-foot"><button class="atlas-link" onclick={() => show = false}>Return</button></div>
    </div>
  </div>
{/if}
<style>
  .soon{margin-top:calc(-1 * var(--space-3))}
</style>
