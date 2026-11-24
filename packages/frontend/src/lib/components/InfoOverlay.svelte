<script lang="ts">
  import ReflectionPrivacy from './ReflectionPrivacy.svelte';

  let { show = $bindable(false) }: { show: boolean } = $props();
  const titleId = $props.id();
</script>

{#if show}
  <dialog {@attach dialog => dialog.showModal()} aria-labelledby={titleId} closedby="any" onclose={() => show = false}>
    <header>
      <h1 id={titleId}>About Lacuna</h1>
      <form method="dialog"><button class="atlas-link">Close</button></form>
    </header>
    <p>Lacuna is a private journal. Each page you save has an address in your city. Open a building to revisit the words you left there.</p>
    <h2>What can I do for free?</h2>
    <p>Write, explore your city, and reread your pages without an account. Your passphrase protects the journal on this device. Backups and exports are free. Lacuna is for writers aged 13 and older. Encrypted sync is free and starts off.</p>
    <h2>Reflections is coming soon</h2>
    <p>We’re designing an optional feature for adults. The Soul Map would connect recurring themes across your pages. The Living Memoir would turn moments you’ve written about into short passages, with links back to your words so you can judge the interpretation yourself.</p>
    <ReflectionPrivacy/>
  </dialog>
{/if}

<style>
  dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(var(--measure-sheet), calc(100% - 2rem));
    max-height: 88dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--sheet-inset);
    border: 0;
    border-radius: var(--radius-s);
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--shadow-sheet);
    font: 400 var(--text-md)/var(--lh-prose) var(--font);
  }
  dialog::backdrop { background: var(--scene-backdrop); overflow: hidden; overscroll-behavior: contain; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); }
  h1 { font: 400 var(--display-2)/var(--lh-display) var(--font); letter-spacing: var(--ls-display); }
  h2 { margin-top: var(--space-5); font: 400 var(--text-xl)/var(--lh-heading) var(--font); letter-spacing: var(--ls-heading); }
  dialog :global(p) { margin-top: var(--space-2); color: var(--ink-muted); text-wrap: pretty; }
</style>
