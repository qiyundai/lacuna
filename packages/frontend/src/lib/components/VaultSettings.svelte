<script lang="ts">
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/modal.js';
  import { vaultRequest, loadVault, lockVault } from '$lib/stores/vault.svelte.js';
  import { downloadFile } from '$lib/story.js';
  import BrowserSync from './BrowserSync.svelte';
  let { show = $bindable(false) }: { show: boolean } = $props();
  let busy = $state(false), error = $state(''), message = $state('');
  let recoveryCopies = $state<string[]>([]);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    busy = true; error = ''; message = '';
    try { await action(); await loadVault(); }
    catch (e) { error = e instanceof Error ? e.message : 'Could not complete that change.'; }
    finally { busy = false; }
  }
  $effect(() => { if (show) untrack(() => run(async () => {
    const { browserVault } = await import('$lib/web-vault.js'); recoveryCopies = await browserVault().recoveryCopies();
  })); });
</script>
{#if show}
  <div class="sheet-screen" style:z-index="225" use:modal={{ dismiss: () => { if (!busy) show = false; } }} role="dialog" aria-modal="true" aria-label="Privacy and storage" tabindex="-1" onclick={e => { if (!busy && e.target === e.currentTarget) show = false; }} onkeydown={e => { if (!busy && e.key === 'Escape') show = false; }} transition:fade={{ duration: 400, easing: cubicOut }}>
    <div class="journal-sheet">
      <h2>Privacy &amp; storage</h2>
      <p>Your journal is encrypted in this browser. It locks after 15 minutes without keyboard or pointer activity. Unsaved words disappear when it locks.</p>
      <button class="atlas-link" disabled={busy} onclick={() => run(async () => { await lockVault(); show = false; })}>Lock my space now</button>
      <button class="atlas-link" disabled={busy} onclick={() => run(async () => { const encrypted = await vaultRequest('vault/backup'); downloadFile(JSON.stringify(encrypted), `lacuna-${new Date().toISOString().slice(0, 10)}.lacuna-web-vault`, 'application/json'); message = 'Encrypted backup downloaded. Keep it and your passphrase somewhere you can recover.'; })}>Download an encrypted backup</button>
      <p class="note">The backup stays encrypted outside this app. Restore it from the lock screen with your passphrase.</p>
      <BrowserSync/>
      <section>
        <h3>Your encrypted journal</h3>
        <p>An encrypted backup opens with your original passphrase. A browser file restore starts with sync off.</p>
        <p>Clearing site data, using a private tab, losing your device, or browser storage cleanup can erase the only copy. Keep an encrypted backup somewhere safe. You can restore a browser backup on another phone or computer using its original passphrase.</p>
        {#if recoveryCopies.length}<h3>Copies kept before a restore.</h3><p>These files remain encrypted with their original passphrase.</p>{/if}
        {#each recoveryCopies as id}
          <button class="atlas-link" disabled={busy} onclick={() => run(async () => { const { browserVault } = await import('$lib/web-vault.js'); const encrypted = await browserVault().recoveryCopy(id); downloadFile(JSON.stringify(encrypted), `lacuna-restore-copy-${id.split(':')[1]}.lacuna-web-vault`, 'application/json'); })}>Download copy from {new Date(Number(id.split(':')[1])).toLocaleString()}</button>
        {/each}
      </section>
      {#if error}<p role="alert" class="error">{error}</p>{/if}
      {#if message}<p role="status">{message}</p>{/if}
      <div class="sheet-foot">
        <button class="atlas-link" disabled={busy} onclick={() => show = false}>Return to my space</button>
        <a class="atlas-link subtle" href="/privacy">Privacy declaration</a>
      </div>
    </div>
  </div>
{/if}
<style>
  .error{color:var(--danger)}
</style>
