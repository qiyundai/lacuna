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


  function dismiss() {
    show = false;
    if (consentMode) onConsent?.();
  }
</script>

<svelte:window onkeydown={(e) => { if (!consentMode && e.key === 'Escape') dismiss(); }} />

{#if show}
  <div
    use:modal={{ dismiss: consentMode ? undefined : dismiss }}
    class="screen-overlay privacy-overlay"
    transition:fade={{ duration: 500, easing: cubicOut }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Data and privacy"
    onclick={() => { if (!consentMode) dismiss(); }}
    onkeydown={(e) => { if (!consentMode && e.key === 'Escape') dismiss(); }}
  >
    <div class="privacy-content">
      <p>your entries are stored in your private Lacuna account. the local companion sends reflection context to OpenAI to create reflections, a concept map, and your memoir using your ChatGPT plan.</p>
      <p>ChatGPT signs you in. Lacuna verifies an identity token to create your account; access and refresh tokens stay on your computer. generated reflections are saved to Lacuna. eligible requests use your plan allowance or credits.</p>
      <p>deleting your account permanently removes everything — entries, your concept map, and all generated text — from our servers.</p>
      {#if isCompanion}<p class="hint">disconnecting ChatGPT removes credentials here. manage app access and usage in ChatGPT settings.</p>{/if}
      {#if consentMode}<button class="hint" onclick={dismiss}>acknowledge and continue</button>{:else}<p class="hint">anywhere to close</p>{/if}
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
  button.hint { background: none; border: none; font: inherit; cursor: pointer; line-height: 1.8; }
</style>
