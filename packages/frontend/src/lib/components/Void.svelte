<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { draft, appendText, deleteChar, clearDraft } from '$lib/stores/draft.svelte.js';
  import { holdDetector, shakeDetector } from '$lib/gesture.js';
  import { api } from '$lib/api.js';
  import { prependEntry } from '$lib/stores/entries.svelte.js';

  let { onSwipeDown }: { onSwipeDown: () => void } = $props();

  let inputEl = $state<HTMLTextAreaElement | undefined>(undefined);
  let container = $state<HTMLDivElement | undefined>(undefined);
  let solidifying = $state(false);
  let solidifyProgress = $state(0); // 0-1, shown as condensing animation
  let justSolidified = $state(false);

  let gestureCleanup: (() => void) | null = null;
  let shakeCleanup: (() => void) | null = null;

  onMount(() => {
    focusInput();

    if (container) {
      const hold = holdDetector(container, {
        durationMs: 600,
        onHoldStart: () => {
          if (!draft.isDirty) return;
          solidifying = true;
          // Visual progress — animate over 600ms
          const start = Date.now();
          const tick = () => {
            solidifyProgress = Math.min((Date.now() - start) / 600, 1);
            if (solidifyProgress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        },
        onHold: () => {
          if (!draft.isDirty) {
            solidifying = false;
            solidifyProgress = 0;
            return;
          }
          solidifyEntry();
        },
        onHoldCancel: () => {
          solidifying = false;
          solidifyProgress = 0;
        },
      });
      gestureCleanup = hold.destroy;
    }

    const shake = shakeDetector(() => {
      clearDraft();
    });
    shakeCleanup = shake.destroy;

    window.addEventListener('visibilitychange', focusInput);
  });

  onDestroy(() => {
    gestureCleanup?.();
    shakeCleanup?.();
    window.removeEventListener('visibilitychange', focusInput);
  });

  function focusInput() {
    inputEl?.focus();
  }

  async function solidifyEntry() {
    const text = draft.text.trim();
    if (!text) {
      solidifying = false;
      solidifyProgress = 0;
      return;
    }

    const solidifiedAt = Math.floor(Date.now() / 1000);
    clearDraft();
    solidifying = false;
    solidifyProgress = 0;
    justSolidified = true;
    setTimeout(() => (justSolidified = false), 1500);

    try {
      const { entry } = await api.entries.create(text, solidifiedAt);
      prependEntry(entry);
    } catch (err) {
      console.error('Failed to save entry:', err);
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    // We manage text ourselves; keep textarea in sync but drive from store
    const val = target.value;
    // Derive what changed
    if (val.length > draft.text.length) {
      const added = val.slice(draft.text.length);
      for (const ch of added) appendText(ch);
    } else {
      const deleted = draft.text.length - val.length;
      for (let i = 0; i < deleted; i++) deleteChar();
    }
    // Keep textarea value synced to store
    target.value = draft.text;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault(); // no newlines — space acts as word separator
      appendText(' ');
    }
  }

  function handleTouchEnd() {
    // Re-focus after touch (iOS keyboard dismissal prevention)
    setTimeout(() => inputEl?.focus(), 0);
  }
</script>

<div
  class="void"
  class:solidifying
  bind:this={container}
  role="main"
>
  <!-- Floating words -->
  {#each draft.words as wp (wp.key)}
    <span
      class="word"
      class:condensing={solidifying}
      style="
        left: {wp.x}%;
        top: {wp.y}%;
        animation-delay: {wp.delay}ms;
        --condense-progress: {solidifyProgress};
      "
    >{wp.word}</span>
  {/each}

  {#if justSolidified}
    <div class="exhale-ring"></div>
  {/if}

  <!-- Hidden input captures all keystrokes and click/touch focus -->
  <textarea
    bind:this={inputEl}
    class="hidden-input"
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck={false}
    oninput={handleInput}
    onkeydown={handleKeyDown}
    onclick={focusInput}
    ontouchend={handleTouchEnd}
    value={draft.text}
    aria-label="Write here"
  ></textarea>

  <!-- Subtle down hint -->
  {#if !draft.isDirty}
    <button class="down-hint" onclick={onSwipeDown} aria-label="Go to your story">
      <span>↓</span>
    </button>
  {/if}
</div>

<style>
  .void {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--bg);
    overflow: hidden;
    touch-action: none;
    cursor: text;
  }

  .hidden-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    resize: none;
    border: none;
    background: transparent;
    color: transparent;
    caret-color: transparent;
    cursor: text;
    z-index: 1;
  }

  .word {
    position: absolute;
    transform: translate(-50%, -50%);
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: clamp(0.9rem, 2.5vw, 1.4rem);
    letter-spacing: 0.04em;
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
    z-index: 2;
    animation: float 4s ease-in-out infinite alternate;
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;
  }

  .word.condensing {
    transform: translate(-50%, -50%) scale(calc(1 - var(--condense-progress) * 0.15));
    opacity: calc(1 - var(--condense-progress) * 0.3);
  }

  @keyframes float {
    from { transform: translate(-50%, -50%) translateY(0px); }
    to   { transform: translate(-50%, -50%) translateY(-6px); }
  }

  .exhale-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    transform: translate(-50%, -50%);
    animation: exhale 1.5s ease-out forwards;
    pointer-events: none;
  }

  @keyframes exhale {
    from { transform: translate(-50%, -50%) scale(0.5); opacity: 0.6; }
    to   { transform: translate(-50%, -50%) scale(4); opacity: 0; }
  }

  .down-hint {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: none;
    border: none;
    color: var(--void-text-faint);
    font-size: 1.2rem;
    cursor: pointer;
    animation: bob 2s ease-in-out infinite;
    user-select: none;
    z-index: 3;
    padding: 0.5rem;
  }

  @keyframes bob {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50%       { transform: translateX(-50%) translateY(4px); }
  }
</style>
