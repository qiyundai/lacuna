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
    class="screen-overlay info-overlay"
    transition:fade={{ duration: 500, easing: cubicOut }}
    role="dialog"
    aria-modal="true"
    aria-label="What is Lacuna"
    onclick={dismiss}
  >
    <div class="info-content">
      <p>a private space, just yours. you type, words float, nothing goes anywhere unless you hold a thought long enough to mean it.</p>
      <p>if you keep coming back, those fragments start to find each other. something like a shape of you begins to appear.</p>
      <p>swipe down whenever you're ready to see what's gathered — the things you've written, the patterns within them, and in time, a kind of living story woven from all of it.</p>
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

  .info-overlay {
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    cursor: pointer;
  }

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
