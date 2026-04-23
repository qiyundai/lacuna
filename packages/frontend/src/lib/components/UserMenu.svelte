<script lang="ts">
  import { session, signOut } from '$lib/stores/session.svelte.js';
  import { api } from '$lib/api.js';

  let open = $state(false);
  let confirming = $state(false);
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
    if (e.key === 'Escape') close();
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
      <button class="action" onclick={signOut} role="menuitem">sign out</button>
      <button class="action delete" onclick={handleDelete} role="menuitem">
        {confirming ? 'sure?' : 'delete account'}
      </button>
    </div>
  {/if}
</div>

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
</style>
