<script lang="ts">
  import { browserVault } from '$lib/web-vault.js';
  import { lockVault } from '$lib/stores/vault.svelte.js';
  import Masthead from './Masthead.svelte';
  import ArchiveExport from './ArchiveExport.svelte';
  import { removeOnline } from '$lib/browser-sync.js';
  const vault = browserVault();
  const pages = vault.read().entries.toReversed();
  let exporting = $state(false), confirmDelete = $state(false), busy = $state(false), message = $state('');
  let paired = $state(!!vault.pairing);
  async function deleteCopy() {
    if (!confirmDelete) { confirmDelete = true; return; }
    busy = true;
    try { await removeOnline(vault); paired = false; message = 'Online copy deleted.'; }
    catch { message = 'Could not remove the online copy. Try again.'; }
    finally { busy = false; confirmDelete = false; }
  }
</script>
<Masthead journalMenu/>
<main>
  <div class="journal-sheet">
    <h1>Your journal</h1><p>Journaling is coming soon in this region. You can read and export the pages saved on this device.</p>
    <nav><button class="atlas-link" onclick={() => exporting = true}>Export journal</button>
      <a class="atlas-link" href="/billing">Manage billing and AI permission</a>
      <button class="atlas-link" onclick={lockVault}>Lock journal</button>
    </nav>
    {#if paired}<button class="atlas-link" disabled={busy} onclick={deleteCopy}>{confirmDelete?'Confirm deletion for all paired devices':'Delete encrypted online copy'}</button>
      {#if confirmDelete}<button class="atlas-link" onclick={() => confirmDelete=false}>Keep online copy</button>{/if}
    {/if}
    <p role="status">{message}</p>
    {#each pages as entry (entry.id)}<article><time>{new Date(entry.created_at * 1000).toLocaleDateString()}</time><p>{entry.body}</p></article>{/each}
  </div>
</main>
<ArchiveExport bind:show={exporting}/>
<style>
  main{height:calc(100% - var(--mast-height));overflow:auto;padding:var(--sheet-inset);background:var(--paper)}
  nav{display:flex;flex-wrap:wrap;gap:var(--space-4)}
  article p{white-space:pre-wrap;overflow-wrap:anywhere}
</style>
