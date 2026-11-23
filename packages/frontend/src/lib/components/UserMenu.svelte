<script lang="ts">
  import { aiAvailable } from '../../../../shared/ai-release.js';
  import { session, signOut } from '$lib/stores/session.svelte.js';
  import { api, isCompanion } from '$lib/api.js';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import InfoOverlay from './InfoOverlay.svelte';
  import PrivacyOverlay from './PrivacyOverlay.svelte';
  import { overlayStore } from '$lib/stores/overlay.svelte.js';
  import ChatGPTSettings from './ChatGPTSettings.svelte';
  import ArchiveExport from './ArchiveExport.svelte';
  import VaultSettings from './VaultSettings.svelte';
  import { vaultStore, lockVault, loadVault } from '$lib/stores/vault.svelte.js';
  import { modal } from '$lib/modal.js';
  import { loadAI } from '$lib/stores/ai.svelte.js';
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { writeLocal } from '$lib/storage.js';

  let open = $state(false);
  let confirming = $state(false);
  let showInfo = $state(false);
  let showPrivacy = $state(false);
  let showPlan = $state(false);
  let showExport = $state(false);
  let showVault = $state(false);
  let error = $state('');
  let deleting = $state(false);
  onMount(() => {
    let mounted = true;
    const returned=new URL(location.href);
    if(!isCompanion && returned.searchParams.get('billing')==='returned'){
      showPlan=true;returned.searchParams.delete('billing');replaceState(returned,page.state);
    }
    loadAI().then(() => {
      if (mounted && !vaultStore.status?.migrated) showVault = true;
    }).catch(() => {});
    return () => { mounted = false; };
  });

  export function showSettings(){ open = true; }

  function close() {
    open = false;
    confirming = false;
  }

  async function handleDelete() {
    if (deleting) return;
    if (!confirming) {
      confirming = true;
      return;
    }
    deleting = true; error = '';
    try {
      await api.auth.deleteAccount();
      signOut();
      if (!isCompanion) await loadVault();
    } catch (err) { error = err instanceof Error ? err.message : 'Could not delete your account. Try again.'; }
    finally { deleting = false; }
  }
  async function handleSignOut() {
    if (!isCompanion) { try { await lockVault(); } catch { error = 'Could not lock this space. Try again.'; } return; }
    try {
      const result = await api.auth.logout();
      if (!result.revoked || !result.openaiRevoked) writeLocal('lacuna_revocation_notice', 'Signed out on this computer. A remote revocation was not confirmed; review connected apps in ChatGPT settings.');
      signOut();
    } catch { error = 'Could not disconnect the companion. Try signing out again.'; }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showInfo) { showInfo = false; return; }
      if (showPrivacy) { showPrivacy = false; return; }
      if (showPlan) { showPlan = false; return; }
      if (showExport) { showExport = false; return; }
      if (showVault) { showVault = false; return; }
      if (open) { close(); return; }
    }
  }

  $effect(() => {
    overlayStore.open = open || showInfo || showPrivacy || showPlan || showExport || showVault;
    return () => { overlayStore.open = false; };
  });

</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    use:modal={{ dismiss: close }}
    class="sheet-screen"
    transition:fade={{ duration: 400, easing: cubicOut }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Journal settings"
    onclick={(e) => { if (e.target === e.currentTarget) close(); }}
    onkeydown={(e) => { if (e.key === 'Escape') close(); }}
  >
    <div class="journal-sheet">
      <header>
        <h2>Journal settings</h2>
        <p class="note">{session.user?.email}</p>
      </header>
      <nav class="menu-actions" aria-label="Settings">
        <button class="menu-item" onclick={() => { open = false; confirming = false; showInfo = true; }}>About Lacuna</button>
        <button class="menu-item" onclick={() => { open = false; confirming = false; showPrivacy = true; }}>Data and privacy</button>
        <button class="menu-item" onclick={() => { open = false; showVault = true; }}>Privacy &amp; storage</button>
        <button class="menu-item" onclick={() => { open = false; showPlan = true; }}>AI reflections{#if !aiAvailable}<span class="soon">Coming soon</span>{/if}</button>
        <button class="menu-item" onclick={() => { open = false; showExport = true; }}>Export journal</button>
        <button class="menu-item" onclick={handleSignOut}>{isCompanion ? 'Sign out' : 'Lock journal'}</button>
      </nav>
      <div class="sheet-foot">
        <button class="atlas-link" onclick={close}>Close settings</button>
        <button class="atlas-link danger" disabled={deleting} onclick={handleDelete}>
          {confirming ? 'Confirm journal deletion' : isCompanion ? 'Delete account' : 'Delete this browser journal'}
        </button>
      </div>
      {#if confirming}<p class="note" transition:fade={{ duration: 250 }}>{isCompanion ? 'This removes the active server account, cloud copy, and this computer’s vault and encrypted conflict backups.' : 'This removes this browser’s journal, pairing code and recovery copies. To erase a synced online copy, delete it first in Privacy & storage.'} It cannot be undone here. Downloaded files and other devices are separate. Download a backup first if you want to keep your words.</p>{/if}
      {#if error}<p role="alert" class="note error">{error}</p>{/if}
    </div>
  </div>
{/if}

<InfoOverlay bind:show={showInfo} />
<PrivacyOverlay bind:show={showPrivacy} />
<ChatGPTSettings bind:show={showPlan} />
<ArchiveExport bind:show={showExport} />
<VaultSettings bind:show={showVault} />

<style>
  header{display:grid;gap:var(--space-1)}
  header h2{margin:0}
  .menu-actions{display:grid;justify-items:start;margin-top:var(--space-3)}
  .menu-item{display:inline-flex;align-items:baseline;gap:var(--space-3);min-height:52px;padding:0;border:0;background:transparent;color:var(--ink);font:400 var(--display-3)/var(--lh-heading) var(--font);letter-spacing:var(--ls-heading);text-align:start;cursor:pointer;transition:color var(--dur-micro) var(--ease-soft)}
  .menu-item:is(:hover,:focus-visible){color:var(--accent)}
  .soon{font:400 var(--ui-sm)/1 var(--font);letter-spacing:var(--ls-ui);color:var(--ink-subtle)}
  .error{color:var(--danger)}
</style>
