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
    gap: 1.5rem;
    max-width: 340px;
    padding: 0 2rem;
    text-align: center;
  }

  .heading {
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 1rem;
    letter-spacing: 0.1em;
    margin: 0;
    opacity: 0.8;
  }

  .sub {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    line-height: 1.7;
    margin: 0;
    opacity: 0.6;
  }

  .code {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.25rem 2rem;
    transition: border-color 0.3s ease;
    width: 100%;
  }

  .code:hover {
    border-color: rgba(255, 255, 255, 0.18);
  }

  .code-text {
    color: var(--void-text);
    font-family: var(--font-mono, monospace);
    font-size: 1.1rem;
    letter-spacing: 0.18em;
    opacity: 0.9;
  }

  .copy-hint {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    opacity: 0.5;
    transition: opacity 0.2s;
  }

  .code:hover .copy-hint {
    opacity: 0.9;
  }

  .acknowledge {
    background: transparent;
    border: none;
    color: var(--void-text-dim);
    cursor: pointer;
    font-family: var(--font-serif);
    font-size: 0.88rem;
    letter-spacing: 0.1em;
    opacity: 0.5;
    padding: 0.4rem 0;
    transition: opacity 0.3s ease;
  }

  .acknowledge:hover,
  .acknowledge:focus {
    opacity: 1;
    outline: none;
  }
</style>
