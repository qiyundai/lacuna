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

      <p class="music-nudge">before you begin — put on something you love. let the walls crack a little.</p>

      <div class="lenses-section">
        <p class="lenses-intro">as you write, we read through six lenses — not to label you, but to find the shape of what keeps returning.</p>

        <ul class="lenses">
          <li>
            <span class="lens-label">Story / Through-line</span>
            <span class="lens-desc">the thread running through everything you write — your personal myth</span>
          </li>
          <li>
            <span class="lens-label">Voices</span>
            <span class="lens-desc">the parts of you that pull in different directions, the contradictions</span>
          </li>
          <li>
            <span class="lens-label">Blind Spots</span>
            <span class="lens-desc">what you consistently circle around but never quite say</span>
          </li>
          <li>
            <span class="lens-label">What's Unsaid</span>
            <span class="lens-desc">persistent absences — the recurring negations and shadow themes</span>
          </li>
          <li>
            <span class="lens-label">The Story You Keep Telling</span>
            <span class="lens-desc">a self-narrative that keeps reappearing, and the threads that could change it</span>
          </li>
          <li>
            <span class="lens-label">Where You Are</span>
            <span class="lens-desc">the life-stage underneath the words — belonging, legacy, identity, purpose</span>
          </li>
        </ul>

        <p class="lenses-close">these lenses shape your soul map and, in time, the living memoir — a piece of prose that becomes more honest the longer you stay.</p>
      </div>

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
    background: rgba(19, 16, 16, 0.82);
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    cursor: pointer;
  }

  .info-content {
    position: relative;
    z-index: 1;
    max-width: 42ch;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6);
    text-align: center;
  }

  .info-content p {
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    line-height: var(--lh-prose);
    letter-spacing: var(--ls-prose);
    margin: 0;
  }

  .music-nudge {
    color: var(--void-text) !important;
    font-style: italic;
    margin-top: var(--space-3) !important;
  }

  .lenses-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-top: var(--space-2);
  }

  .lenses-intro {
    color: var(--void-text-hint) !important;
    font-family: var(--font-serif);
    font-size: var(--text-sm) !important;
    line-height: var(--lh-prose);
    letter-spacing: var(--ls-prose);
    margin: 0;
  }

  .lenses {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .lenses li {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
  }

  .lens-label {
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    line-height: 1.5;
    letter-spacing: var(--ls-prose);
  }

  .lens-desc {
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    line-height: var(--lh-prose);
    letter-spacing: var(--ls-prose);
  }

  .lenses-close {
    color: var(--void-text-hint) !important;
    font-family: var(--font-serif);
    font-size: var(--text-sm) !important;
    line-height: var(--lh-prose);
    letter-spacing: var(--ls-prose);
    font-style: italic;
    margin: 0;
  }

  .info-content .hint {
    color: var(--void-text-hint);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
    margin-top: var(--space-3);
  }
</style>
