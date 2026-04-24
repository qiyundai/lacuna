<script lang="ts">
  import { session, signOut } from '$lib/stores/session.svelte.js';
  import { api } from '$lib/api.js';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

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
  >
    <button class="overlay-backdrop" onclick={close} aria-label="Close menu" tabindex="-1"></button>
    <div class="menu-content">
      <p class="menu-email">{session.user?.email}</p>
      <nav class="menu-actions">
        <button class="menu-item" onclick={() => { showInfo = true; close(); }}>what is this</button>
        <button class="menu-item" onclick={signOut}>sign out</button>
        <button class="menu-item danger" onclick={handleDelete}>
          {confirming ? 'sure?' : 'delete account'}
        </button>
      </nav>
    </div>
  </div>
{/if}

{#if showInfo}
  <div
    use:portal
    class="screen-overlay"
    transition:fade={{ duration: 500, easing: cubicOut }}
    role="dialog"
    aria-modal="true"
    aria-label="What is Lacuna"
  >
    <button class="overlay-backdrop" onclick={() => (showInfo = false)} aria-label="Close" tabindex="-1"></button>
    <div class="info-content">
      <p>a private space, just yours. you type, words float, nothing goes anywhere unless you hold a thought long enough to mean it.</p>
      <p>if you keep coming back, those fragments start to find each other. something like a shape of you begins to appear.</p>
      <p>swipe down whenever you're ready to see what's gathered — the things you've written, the patterns within them, and in time, a kind of living story woven from all of it.</p>
      <p class="hint">anywhere to close</p>
    </div>
  </div>
{/if}

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

  /* Both overlays share this full-screen shell */
  .screen-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .overlay-backdrop {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: none;
    width: 100%;
    height: 100%;
    padding: 0;
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

  /* ── Info ─────────────────────────────────── */

  .info-content {
    position: relative;
    z-index: 1;
    max-width: 34ch;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    padding: 2rem;
    text-align: center;
  }

  .info-content p {
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 1rem;
    line-height: 1.85;
    letter-spacing: 0.025em;
    margin: 0;
  }

  .info-content .hint {
    color: var(--void-text-faint);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    margin-top: 0.5rem;
  }
</style>
