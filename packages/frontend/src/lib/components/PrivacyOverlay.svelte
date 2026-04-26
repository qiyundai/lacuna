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
      <p>to surface patterns in your story, entries are processed by anthropic's api. each entry also builds a private concept map — themes, emotions, recurring ideas — stored here to make the memoir richer over time. anthropic does not use api data to train their models.</p>
      <p>deleting your account permanently removes everything — entries, your concept map, and all generated text — from our servers.</p>
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
    max-width: 36ch;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6);
    text-align: center;
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
