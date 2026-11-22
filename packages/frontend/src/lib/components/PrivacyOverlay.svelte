<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/modal.js';
  import { isCompanion } from '$lib/api.js';

  let {
    show = $bindable(false),
    consentMode = false,
    onConsent,
  }: { show: boolean; consentMode?: boolean; onConsent?: () => void } = $props();


  function dismiss() { show = false; }
  function acknowledge() {
    show = false;
    onConsent?.();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') dismiss(); }} />

{#if show}
  <div
    use:modal={{ dismiss }}
    class="screen-overlay privacy-overlay"
    transition:fade={{ duration: 500, easing: cubicOut }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Data and privacy"
    onclick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    onkeydown={(e) => { if (e.key === 'Escape') dismiss(); }}
  >
    <div class="privacy-content journal-sheet">
      <h2>Data and privacy</h2>
      {#if isCompanion}
      <p>New journal content is encrypted in a passphrase-protected vault on this computer. Cloud sync and AI sharing start off.</p>
      <p>ChatGPT signs you in. Lacuna verifies an identity token. Access and refresh tokens stay in the local companion. AI reflections are coming soon.</p>
      <p>Optional cloud sync stores an encrypted copy. Older cloud journals need a verified migration before their active plaintext records are removed. Deletion does not instantly erase provider backups or copies you exported.</p>
      <a class="hint" href="/privacy">Read the full privacy declaration</a>
      <p class="hint">Disconnecting ChatGPT removes credentials here. Manage app access and usage in ChatGPT settings.</p>
      {:else}
        <p>Your journal starts encrypted in this browser. Lacuna cannot recover your passphrase.</p>
        <p>If you enable sync in Privacy &amp; storage, Lacuna stores a copy that requires your private pairing code and journal passphrase to open. The service sees the size and timing of transfers. AI reflections are coming soon.</p>
        <p>Pausing sync keeps the online copy. You can delete it in Privacy &amp; storage. Encrypted backups need your passphrase. Markdown and JSON exports can be read by anyone with the file.</p>
        <a class="hint" href="/privacy">Read the full privacy declaration</a>
      {/if}
      {#if consentMode}<button class="atlas-primary" onclick={acknowledge}>Acknowledge and continue</button>{/if}
      <button class="atlas-link" onclick={dismiss}>{consentMode ? "Go back" : "Close"}</button>
    </div>
  </div>
{/if}

<style>
  .screen-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .privacy-overlay {
    overflow-y: auto;
    padding: 2rem 0;
    background: rgba(19, 16, 16, 0.82);
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    cursor: pointer;
  }

  .privacy-content {
    max-height: 100%;
    position: relative;
    z-index: 1;
    max-width: 36ch;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6);
    text-align: center;
  }

  @media (max-width: 640px) {
    .privacy-content {
      width: 100%;
      max-width: 100%;
      padding: var(--space-6) var(--space-5);
    }
  }

  .privacy-content p {
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    line-height: var(--lh-prose);
    letter-spacing: var(--ls-prose);
    margin: 0;
  }

  .privacy-content .hint {
    color: var(--void-text-hint);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
    margin-top: var(--space-3);
  }
</style>
