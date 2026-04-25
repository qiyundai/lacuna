<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  let { show = $bindable(false) }: { show: boolean } = $props();

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function dismiss() { show = false; }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') dismiss(); }} />

{#if show}
  <div
    use:portal
    class="screen-overlay privacy-overlay"
    transition:fade={{ duration: 500, easing: cubicOut }}
    role="dialog"
    aria-modal="true"
    aria-label="Data and privacy"
    onclick={dismiss}
  >
    <div class="privacy-content">
      <p>your entries are private to you. no one else can read them.</p>
      <p>to surface patterns in your story, entries are sent to anthropic's api for analysis. anthropic may retain data per their usage policy.</p>
      <p>deleting your account permanently removes all your entries and data from our servers.</p>
      <p class="hint">anywhere to close</p>
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
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    cursor: pointer;
  }

  .privacy-content {
    position: relative;
    z-index: 1;
    max-width: 34ch;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    padding: 2rem;
    text-align: center;
  }

  .privacy-content p {
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 1rem;
    line-height: 1.85;
    letter-spacing: 0.025em;
    margin: 0;
  }

  .privacy-content .hint {
    color: var(--void-text-faint);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    margin-top: 0.5rem;
  }
</style>
