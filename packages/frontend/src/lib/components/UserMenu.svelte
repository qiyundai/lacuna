<script lang="ts">
  import { session, signOut } from '$lib/stores/session.svelte.js';
  import { api } from '$lib/api.js';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import InfoOverlay from './InfoOverlay.svelte';
  import PrivacyOverlay from './PrivacyOverlay.svelte';

  let open = $state(false);
  let confirming = $state(false);
  let showInfo = $state(false);
  let showPrivacy = $state(false);
  let emailInput = $state('');
  let emailSaving = $state(false);
  let emailSaved = $state(false);
  let emailError = $state('');
  let showEmailForm = $state(false);

  function toggle() {
    open = !open;
    if (!open) { confirming = false; showEmailForm = false; emailInput = ''; emailError = ''; }
  }

  function close() {
    open = false;
    confirming = false;
    showEmailForm = false;
    emailInput = '';
    emailError = '';
  }

  function openSub(target: 'info' | 'privacy') {
    close();
    if (target === 'info') showInfo = true;
    else showPrivacy = true;
  }

  async function handleDelete() {
    if (!confirming) {
      confirming = true;
      return;
    }
    await api.auth.deleteAccount();
    signOut();
  }

  async function saveEmail() {
    const email = emailInput.trim().toLowerCase();
    if (!email || emailSaving) return;
    emailSaving = true;
    emailError = '';
    try {
      await api.auth.setEmail(email);
      emailSaved = true;
      showEmailForm = false;
      emailInput = '';
      setTimeout(() => { emailSaved = false; }, 3000);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      emailError = code === 'EMAIL_TAKEN' ? 'already in use' : 'something went wrong';
    } finally {
      emailSaving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showInfo) { showInfo = false; return; }
      if (showPrivacy) { showPrivacy = false; return; }
      if (showEmailForm) { showEmailForm = false; emailInput = ''; emailError = ''; return; }
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
      <nav class="menu-actions">
        <button class="menu-item" onclick={() => openSub('info')}>what is this</button>
        <button class="menu-item" onclick={() => openSub('privacy')}>data & privacy</button>
        {#if showEmailForm}
          <div class="email-form">
            <input
              class="email-input"
              type="email"
              placeholder="recovery email"
              bind:value={emailInput}
              autocomplete="email"
              autocapitalize="none"
              spellcheck={false}
              onkeydown={(e) => e.key === 'Enter' && saveEmail()}
            />
            {#if emailError}<p class="email-error">{emailError}</p>{/if}
            <button class="menu-item email-save" onclick={saveEmail} disabled={emailSaving || !emailInput.trim()}>
              {emailSaving ? '·····' : 'save'}
            </button>
          </div>
        {:else}
          <button class="menu-item" onclick={() => { showEmailForm = true; emailError = ''; }}>
            {emailSaved ? 'email saved ·' : 'add recovery email'}
          </button>
        {/if}
        <button class="menu-item" onclick={signOut}>sign out</button>
        <button class="menu-item danger" onclick={handleDelete}>
          {confirming ? 'sure?' : 'delete account'}
        </button>
      </nav>
    </div>
  </div>
{/if}

<InfoOverlay bind:show={showInfo} />
<PrivacyOverlay bind:show={showPrivacy} />

<style>
  .trigger {
    position: absolute;
    top: var(--space-5);
    right: var(--space-5);
    z-index: 20;
    background: none;
    border: none;
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    letter-spacing: var(--ls-label);
    cursor: pointer;
    padding: var(--space-2);
    line-height: 1;
    transition: color var(--dur-base) var(--ease-soft);
  }

  .trigger:hover,
  .trigger:focus {
    color: var(--void-text);
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
    background: color-mix(in srgb, var(--bg) 55%, transparent);
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
    gap: var(--space-7);
  }

  .menu-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-6);
  }

  .menu-item {
    background: none;
    border: none;
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    letter-spacing: var(--ls-ui);
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    transition: color var(--dur-base) var(--ease-soft);
  }

  .menu-item:hover,
  .menu-item:focus {
    color: var(--void-text);
    outline: none;
  }

  .email-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
  }

  .email-input {
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    letter-spacing: var(--ls-prose);
    outline: none;
    padding: var(--space-2) 0;
    text-align: center;
    width: 220px;
    transition: border-color var(--dur-base) var(--ease-soft);
  }

  .email-input:focus {
    border-bottom-color: rgba(255, 255, 255, 0.4);
  }

  .email-input::placeholder {
    color: var(--void-text-faint);
  }

  .email-save:disabled {
    color: var(--void-text-faint);
    cursor: default;
  }

  .email-error {
    color: var(--void-danger);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    margin: 0;
  }

  .menu-item.danger {
    color: var(--void-danger);
    font-size: var(--text-sm);
    letter-spacing: var(--ls-label);
  }

  .menu-item.danger:hover,
  .menu-item.danger:focus {
    color: rgba(232, 130, 120, 1);
  }

</style>
