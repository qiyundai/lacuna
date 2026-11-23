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
    aria-label="Data and privacy"
    onclick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    onkeydown={(e) => { if (e.key === 'Escape') dismiss(); }}
  >
    <div class="journal-sheet">
      <h2>Data and privacy</h2>
      <p>Your journal starts encrypted in this browser. Lacuna cannot recover your passphrase.</p>
      <p>If you enable sync in Privacy &amp; storage, Lacuna stores a copy that requires your private pairing code and journal passphrase to open. The service sees the size and timing of transfers. AI reflections are coming soon.</p>
      <p>Pausing sync keeps the online copy. You can delete it in Privacy &amp; storage. Encrypted backups need your passphrase. Markdown and JSON exports can be read by anyone with the file.</p>
      <a class="atlas-link" href="/privacy">Read the full privacy declaration</a>
      <div class="sheet-foot"><button class="atlas-link" onclick={dismiss}>Close</button></div>
    </div>
  </div>
{/if}
