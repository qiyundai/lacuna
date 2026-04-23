<script lang="ts">
  import { session, signOut } from '$lib/stores/session.svelte.js';
  import { api } from '$lib/api.js';

  let open = $state(false);
  let confirming = $state(false);
  let showInfo = $state(false);
  let menuEl: HTMLDivElement;

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

  function handlePointerDown(e: PointerEvent) {
    if (!open) return;
    if (menuEl && menuEl.contains(e.target as Node)) return;
    close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showInfo) { showInfo = false; return; }
      close();
    }
  }
</script>

<svelte:window onpointerdown={handlePointerDown} onkeydown={handleKeydown} />

<div class="user-menu" bind:this={menuEl}>
  <button class="trigger" onclick={toggle} aria-label="User menu" aria-expanded={open}>
    ···
  </button>

  {#if open}
    <div class="panel" role="menu">
      <p class="email">{session.user?.email}</p>
      <button class="action" onclick={() => { showInfo = true; close(); }} role="menuitem">what is this</button>
      <button class="action" onclick={signOut} role="menuitem">sign out</button>
      <button class="action delete" onclick={handleDelete} role="menuitem">
        {confirming ? 'sure?' : 'delete account'}
      </button>
    </div>
  {/if}
</div>

{#if showInfo}
  <div class="info-overlay" role="dialog" aria-modal="true" aria-label="What is Lacuna">
    <button class="info-backdrop" onclick={() => (showInfo = false)} aria-label="Close" tabindex="-1"></button>
    <div class="info-panel">
      <button class="info-close" onclick={() => (showInfo = false)} aria-label="Close">×</button>
      <div class="info-content">
        <h2>what is this</h2>

        <section>
          <h3>what</h3>
          <p>a private space, just yours. you type, words float, nothing goes anywhere unless you want it to. there's no audience here.</p>
        </section>

        <section>
          <h3>why</h3>
          <p>sometimes a thought just needs to exist somewhere — not to be journaled, not to be shared, just to be placed outside your head for a moment.</p>
          <p>if you keep coming back, those fragments start to find each other. something like a shape of you begins to appear.</p>
        </section>

        <section>
          <h3>how</h3>
          <p>words appear as you type, floating and unresolved. hold a thought and it settles — saved, yours.</p>
          <p>swipe down whenever you're ready to see what's gathered: the things you've written, the patterns within them, and in time, a kind of living story woven from all of it.</p>
          <p>shake to clear the slate and start fresh. nothing permanent is ever lost by accident.</p>
        </section>

        <p class="info-footer">there's no right way to be here.</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .user-menu {
    position: absolute;
    top: 1.25rem;
    right: 1.25rem;
    z-index: 20;
  }

  .trigger {
    background: none;
    border: none;
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 1rem;
    letter-spacing: 0.1em;
    cursor: pointer;
    padding: 0.4rem;
    line-height: 1;
    transition: color 0.2s;
  }

  .trigger:hover,
  .trigger:focus {
    color: var(--void-text-dim);
    outline: none;
  }

  .panel {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    background: var(--bg);
    border: 1px solid rgba(255, 238, 220, 0.08);
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 160px;
    animation: appear 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }

  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .email {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action {
    background: transparent;
    border: none;
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    cursor: pointer;
    padding: 0;
    text-align: left;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .action:hover,
  .action:focus {
    opacity: 1;
    outline: none;
  }

  .action.delete {
    color: rgba(220, 110, 100, 0.75);
  }

  .action.delete:hover,
  .action.delete:focus {
    color: rgba(220, 110, 100, 1);
    opacity: 1;
  }

  .info-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeInfo 0.4s ease forwards;
  }

  @keyframes fadeInfo {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .info-backdrop {
    position: absolute;
    inset: 0;
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: none;
    cursor: pointer;
    width: 100%;
    height: 100%;
    padding: 0;
  }

  .info-panel {
    position: relative;
    z-index: 1;
    max-width: 36ch;
    width: calc(100% - 4rem);
    max-height: 80vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 2.5rem 2rem;
    border: 1px solid rgba(255, 238, 220, 0.08);
    background: color-mix(in srgb, var(--bg) 96%, transparent);
  }

  .info-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    color: var(--void-text-faint);
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    transition: color 0.2s;
  }

  .info-close:hover,
  .info-close:focus {
    color: var(--void-text-dim);
    outline: none;
  }

  .info-content h2 {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.75rem;
    font-weight: normal;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0 0 2rem;
  }

  .info-content section {
    margin-bottom: 1.5rem;
  }

  .info-content h3 {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.68rem;
    font-weight: normal;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin: 0 0 0.6rem;
  }

  .info-content p {
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 0.88rem;
    line-height: 1.75;
    letter-spacing: 0.02em;
    margin: 0 0 0.75rem;
  }

  .info-content p:last-child {
    margin-bottom: 0;
  }

  .info-footer {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.78rem;
    font-style: italic;
    letter-spacing: 0.04em;
    margin-top: 2rem !important;
  }
</style>
