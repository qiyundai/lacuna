<script lang="ts">
  import { session, signOut } from '$lib/stores/session.svelte.js';
  import { api, isCompanion } from '$lib/api.js';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import InfoOverlay from './InfoOverlay.svelte';
  import PrivacyOverlay from './PrivacyOverlay.svelte';
  import { overlayStore } from '$lib/stores/overlay.svelte.js';
  import ChatGPTSettings from './ChatGPTSettings.svelte';
  import ArchiveExport from './ArchiveExport.svelte';
  import { modal } from '$lib/modal.js';
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { aiStore, loadAI } from '$lib/stores/ai.svelte.js';
  import { onMount } from 'svelte';
  import { readLocal, writeLocal } from '$lib/storage.js';

  let open = $state(false);
  let confirming = $state(false);
  let showInfo = $state(false);
  let showPrivacy = $state(false);
  let showPlan = $state(false);
  let showExport = $state(false);
  let error = $state('');
  let deleting = $state(false);
  let showWelcome = $state(false);
  onMount(() => {
    let mounted = true;
    loadAI().then(() => {
      if (mounted && aiStore.companion?.planEnabled && !readLocal(`lacuna_plan_welcome:${session.user?.id}`)) showWelcome = true;
    }).catch(() => {});
    return () => { mounted = false; };
  });
  function welcomeDone() { writeLocal(`lacuna_plan_welcome:${session.user?.id}`, '1'); showWelcome = false; }

  function toggle() {
    open = !open;
    if (!open) confirming = false;
  }

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
      if (isCompanion) await companionRequest('disconnect', 'POST');
      await api.auth.deleteAccount();
      signOut();
    } catch (err) { error = err instanceof Error ? err.message : 'Could not delete your account. Try again.'; }
    finally { deleting = false; }
  }
  async function handleSignOut() {
    try {
      if (isCompanion) {
        const result = await companionRequest<{ revoked: boolean }>('disconnect', 'POST');
        if (!result.revoked) { error = 'Disconnected here. Remote revocation was not confirmed. Manage access in ChatGPT settings, then sign out again.'; return; }
      }
      signOut();
    } catch { error = 'Could not disconnect the companion. Try signing out again.'; }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showInfo) { showInfo = false; return; }
      if (showPrivacy) { showPrivacy = false; return; }
      if (showPlan) { showPlan = false; return; }
      if (showExport) { showExport = false; return; }
      if (open) { close(); return; }
    }
  }

  $effect(() => {
    overlayStore.open = open || showInfo || showPrivacy || showPlan || showWelcome || showExport;
    return () => { overlayStore.open = false; };
  });

  // Escapes transformed ancestors (space-container uses translateY, which
  // traps position:fixed children). Appending to body restores true fixed.
</script>

<svelte:window onkeydown={handleKeydown} />

<button
  class="trigger"
  onclick={toggle}
  aria-label="Menu"
  aria-expanded={open}
>···</button>

{#if open}
  <div
    use:modal={{ dismiss: close }}
    class="screen-overlay"
    transition:fade={{ duration: 500, easing: cubicOut }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Menu"
    onclick={(e) => { if (e.target === e.currentTarget) close(); }}
    onkeydown={(e) => { if (e.key === 'Escape') close(); }}
  >
    <div class="menu-content">
      <p class="menu-email">{session.user?.email}</p>
      <nav class="menu-actions">
        <button class="menu-item" onclick={() => { open = false; confirming = false; showInfo = true; }}>what is this</button>
        <button class="menu-item" onclick={() => { open = false; confirming = false; showPrivacy = true; }}>data & privacy</button>
        <button class="menu-item" onclick={() => { open = false; showPlan = true; }}>AI & ChatGPT plan</button>
        <button class="menu-item" onclick={() => { open = false; showExport = true; }}>take your words with you</button>
        <button class="menu-item" onclick={handleSignOut}>sign out</button>
        <button class="menu-item danger" disabled={deleting} onclick={handleDelete}>
          {confirming ? 'sure?' : 'delete account'}
        </button>
      </nav>
      {#if error}<p role="alert">{error}</p>{/if}
    </div>
  </div>
{/if}

<InfoOverlay bind:show={showInfo} />
<PrivacyOverlay bind:show={showPrivacy} />
<ChatGPTSettings bind:show={showPlan} />
<ArchiveExport bind:show={showExport} />
{#if showWelcome}
  <div use:modal={{ dismiss: welcomeDone }} class="screen-overlay" role="dialog" aria-modal="true" aria-label="You’re using your ChatGPT plan" tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) welcomeDone(); }} onkeydown={(e) => { if (e.key === 'Escape') welcomeDone(); }} transition:fade={{ duration: 500, easing: cubicOut }}>
    <div class="welcome-content">
      <p>you’re using your ChatGPT plan</p>
      <p>eligible AI requests use your ChatGPT plan allowance or credits. your entries remain in your Lacuna account.</p>
      <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage usage</a>
      <button class="menu-item" onclick={welcomeDone}>Got it</button>
    </div>
  </div>
{/if}

<style>
  .welcome-content { max-width: 42ch; padding: 2rem; text-align: center; display: flex; flex-direction: column; gap: 1.8rem; line-height: 1.8; letter-spacing: .03em; }
  .welcome-content a { color: var(--void-text-dim); }
  .trigger {
    position: absolute;
    top: 1.25rem;
    right: 1.25rem;
    z-index: 20;
    background: none;
    border: none;
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 1rem;
    letter-spacing: 0.1em;
    cursor: pointer;
    padding: 0.4rem;
    line-height: 1;
    transition: color 0.3s ease;
  }

  .trigger:hover,
  .trigger:focus {
    color: var(--void-text-dim);
    outline: none;
  }

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

  /* ── Menu ─────────────────────────────────── */

  .menu-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3rem;
    cursor: default;
  }

  .menu-email {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    margin: 0;
  }

  .menu-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
  }

  .menu-item {
    background: none;
    border: none;
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 1.15rem;
    letter-spacing: 0.06em;
    cursor: pointer;
    padding: 0;
    opacity: 0.6;
    transition: opacity 0.3s ease, color 0.3s ease;
  }

  .menu-item:hover,
  .menu-item:focus {
    opacity: 1;
    color: var(--void-text);
    outline: none;
  }

  .menu-item.danger {
    color: rgba(220, 110, 100, 0.65);
    font-size: 0.88rem;
    letter-spacing: 0.08em;
  }

  .menu-item.danger:hover,
  .menu-item.danger:focus {
    color: rgba(220, 110, 100, 1);
    opacity: 1;
  }

</style>
