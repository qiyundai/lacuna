<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let {
    code,
    onAcknowledge,
  }: {
    code: string;
    onAcknowledge: () => void;
  } = $props();

  let copied = $state(false);

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  async function copy() {
    await navigator.clipboard.writeText(code);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }
</script>

<div
  use:portal
  class="screen-overlay"
  transition:fade={{ duration: 400, easing: cubicOut }}
  role="dialog"
  aria-modal="true"
  aria-label="Save recovery code"
>
  <div class="content">
    <p class="heading">save your recovery code</p>
    <p class="sub">if you ever lose access to your passkey, this gets you back in. it changes each time you use it.</p>
    <button class="code" onclick={copy} aria-label="Copy recovery code">
      <span class="code-text">{code}</span>
      <span class="copy-hint">{copied ? 'copied' : 'tap to copy'}</span>
    </button>
    <button class="acknowledge" onclick={onAcknowledge}>
      i've saved it
    </button>
  </div>
</div>

<style>
  .screen-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
  }

  .content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    max-width: 360px;
    padding: 0 var(--space-6);
    text-align: center;
  }

  .heading {
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    letter-spacing: var(--ls-label);
    margin: 0;
  }

  .sub {
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-ui);
    line-height: var(--lh-prose);
    margin: 0;
  }

  .code {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-5) var(--space-6);
    transition: border-color var(--dur-base) var(--ease-soft);
    width: 100%;
  }

  .code:hover,
  .code:focus {
    border-color: rgba(255, 255, 255, 0.28);
    outline: none;
  }

  .code-text {
    color: var(--void-text);
    font-family: var(--font-mono);
    font-size: var(--text-md);
    letter-spacing: var(--ls-display);
  }

  .copy-hint {
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
    transition: color var(--dur-fast) var(--ease-soft);
  }

  .code:hover .copy-hint,
  .code:focus .copy-hint {
    color: var(--void-text);
  }

  .acknowledge {
    background: transparent;
    border: none;
    color: var(--void-text-dim);
    cursor: pointer;
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    letter-spacing: var(--ls-label);
    padding: var(--space-2) var(--space-4);
    transition: color var(--dur-base) var(--ease-soft);
  }

  .acknowledge:hover,
  .acknowledge:focus {
    color: var(--void-text);
    outline: none;
  }
</style>
