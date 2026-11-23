<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/modal.js';

  let { show = $bindable(false) }: { show: boolean } = $props();

  function dismiss() { show = false; }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') dismiss(); }} />

{#if show}
  <div
    use:modal={{ dismiss }}
    class="sheet-screen"
    transition:fade={{ duration: 400, easing: cubicOut }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="What is Lacuna"
    onclick={e => { if (e.target === e.currentTarget) dismiss(); }}
    onkeydown={(e) => { if (e.key === 'Escape') dismiss(); }}
  >
    <div class="journal-sheet">
      <h2>About Lacuna</h2>
      <p>Each page has an address in the city. Select its building to read it again.</p>
      <p>Find the Soul Map and Living Memoir in the Journal view. AI reflections in Journal settings shows their availability.</p>
      <p>Quiet writing gives you a blank page. Hold to save, or press Control or Command and Enter.</p>
      <p>Find encrypted sync and backups in Journal settings → Privacy &amp; storage. Choose Export journal to download a readable copy.</p>
      <div class="sheet-foot"><button class="atlas-link" onclick={dismiss}>Close</button></div>
    </div>
  </div>
{/if}

