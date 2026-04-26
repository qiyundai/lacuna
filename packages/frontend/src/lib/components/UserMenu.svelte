<script lang="ts">
  import { session, signOut } from '$lib/stores/session.svelte.js';
  import { api } from '$lib/api.js';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import InfoOverlay from './InfoOverlay.svelte';
  import { overlayStore } from '$lib/stores/overlay.svelte.js';

  let open = $state(false);
  let confirming = $state(false);
  let showInfo = $state(false);

  function toggle() {
    open = !open;
    if (!open) confirming = false;
  }

  function close() {
    open = false;
    confirming = false;
  }

  async function handleDelete() {
    if (!confirming) {
      confirming = true;
      return;
    }
    await api.auth.deleteAccount();
    signOut();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showInfo) { showInfo = false; return; }
      if (open) { close(); return; }
    }
  }

  $effect(() => {
    overlayStore.open = open;
    return () => { overlayStore.open = false; };
  });

  // Escapes transformed ancestors (space-container uses translateY, which
  // traps position:fixed children). Appending to body restores true fixed.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }
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
    use:portal
    class="screen-overlay"
    transition:fade={{ duration: 500, easing: cubicOut }}
    role="dialog"
    aria-modal="true"
    aria-label="Menu"
    onclick={close}
  >
    <div class="menu-content" onclick={(e) => e.stopPropagation()}>
      <p class="menu-email">{session.user?.email}</p>
      <nav class="menu-actions">
        <button class="menu-item" onclick={() => { open = false; confirming = false; showInfo = true; }}>what is this</button>
        <button class="menu-item" onclick={signOut}>sign out</button>
        <button class="menu-item danger" onclick={handleDelete}>
          {confirming ? 'sure?' : 'delete account'}
        </button>
      </nav>
    </div>
  </div>
{/if}

<InfoOverlay bind:show={showInfo} />

<style>
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
