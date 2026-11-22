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
    class="screen-overlay"
    transition:fade={{ duration: 500, easing: cubicOut }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Journal settings"
    onclick={(e) => { if (e.target === e.currentTarget) close(); }}
    onkeydown={(e) => { if (e.key === 'Escape') close(); }}
  >
    <div class="menu-content">
      <h2>Journal settings</h2>
      <p class="menu-email">{session.user?.email}</p>
      <nav class="menu-actions">
        <button class="menu-item" onclick={() => { open = false; confirming = false; showInfo = true; }}>About Lacuna</button>
        <button class="menu-item" onclick={() => { open = false; confirming = false; showPrivacy = true; }}>Data and privacy</button>
        <button class="menu-item" onclick={() => { open = false; showVault = true; }}>Privacy &amp; storage</button>
        <button class="menu-item" onclick={() => { open = false; showPlan = true; }}>{aiAvailable ? 'AI reflections' : 'AI reflections · Coming soon'}</button>
        <button class="menu-item" onclick={() => { open = false; showExport = true; }}>Export journal</button>
        <button class="menu-item" onclick={handleSignOut}>{isCompanion ? 'Sign out' : 'Lock journal'}</button>
        <button class="menu-item danger" disabled={deleting} onclick={handleDelete}>
          {confirming ? 'Confirm journal deletion' : isCompanion ? 'Delete account' : 'Delete this browser journal'}
        </button>
      </nav>
      <button class="atlas-link" onclick={close}>Close settings</button>
      {#if confirming}<p class="deletion-scope">{isCompanion ? 'This removes the active server account, cloud copy, and this computer’s vault and encrypted conflict backups.' : 'This removes the journal and encrypted restore backups in this browser.'} It cannot be undone here. Downloaded files and other devices are separate. Download a backup first if you want to keep your words.</p>{/if}
      {#if error}<p role="alert">{error}</p>{/if}
    </div>
  </div>
{/if}

<InfoOverlay bind:show={showInfo} />
<PrivacyOverlay bind:show={showPrivacy} />
<ChatGPTSettings bind:show={showPlan} />
<ArchiveExport bind:show={showExport} />
<VaultSettings bind:show={showVault} />

<style>
  .deletion-scope { max-width: 40ch; text-align: center; line-height: 1.8; color: var(--void-text-dim); font-size: .85rem; padding: 0 1rem; }
  .screen-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(19, 16, 16, 0.82);
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    cursor: pointer;
  }

  .screen-overlay{overflow:auto;align-items:safe center;background:var(--field);padding:22px}
  .menu-content{width:min(100%,30rem);margin:auto;display:grid;gap:.8rem;cursor:default}
  h2{font:400 2.65rem/1.1 var(--font-reading);letter-spacing:-.05em}
  .menu-email{color:var(--muted);font:.9rem var(--font-ui)}
  .menu-actions{display:grid;margin:.75rem 0;border-top:1px solid var(--line)}
  .menu-item{font:500 1rem var(--font-ui);min-height:48px;padding:.6rem .2rem;text-align:left;color:var(--ink);background:transparent;border:0;border-bottom:1px solid var(--line);cursor:pointer}
  .menu-item:hover{color:var(--river);background:var(--paper)}.menu-item.danger{color:var(--void-danger)}
</style>
