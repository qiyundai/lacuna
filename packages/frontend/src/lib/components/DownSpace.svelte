<script lang="ts">
  import { onMount } from 'svelte';
  import { loadEntries } from '$lib/stores/entries.svelte.js';
  import { loadPatterns } from '$lib/stores/patterns.svelte.js';
  import { loadMemoir } from '$lib/stores/memoir.svelte.js';
  import Timeline from './Timeline.svelte';
  import SoulMap from './SoulMap.svelte';
  import LivingMemoir from './LivingMemoir.svelte';

  let { onSwipeUp }: { onSwipeUp: () => void } = $props();

  type View = 0 | 1 | 2; // 0=Timeline, 1=SoulMap, 2=LivingMemoir
  let currentView = $state<View>(0);

  let touchStartX = $state(0);

  onMount(() => {
    loadEntries();
    loadPatterns();
    loadMemoir();
  });

  function touchStart(e: TouchEvent) {
    touchStartX = e.touches[0]!.clientX;
  }

  function touchEnd(e: TouchEvent) {
    const deltaX = touchStartX - e.changedTouches[0]!.clientX;
    if (Math.abs(deltaX) < 50) return;
    if (deltaX > 0 && currentView < 2) currentView = (currentView + 1) as View;
    else if (deltaX < 0 && currentView > 0) currentView = (currentView - 1) as View;
  }

  const labels = ['timeline', 'soul map', 'memoir'];
</script>

<div
  class="down-space"
  ontouchstart={touchStart}
  ontouchend={touchEnd}
  role="region"
  aria-label="Your story"
>
  <!-- Up hint -->
  <button class="up-hint" onclick={onSwipeUp} aria-label="Return to void">
    <span>↑</span>
  </button>

  <!-- View container -->
  <div class="views" style="transform: translateX({-currentView * 100}%)">
    <div class="view"><Timeline /></div>
    <div class="view"><SoulMap /></div>
    <div class="view"><LivingMemoir /></div>
  </div>

  <!-- Dot indicators -->
  <div class="dots">
    {#each [0, 1, 2] as i}
      <button
        class="dot"
        class:active={currentView === i}
        onclick={() => (currentView = i as View)}
        aria-label={labels[i]}
      ></button>
    {/each}
  </div>
</div>

<style>
  .down-space {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--bg);
    overflow: hidden;
  }

  .views {
    display: flex;
    width: 300%;
    height: 100%;
    transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    will-change: transform;
  }

  .view {
    width: calc(100% / 3);
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .up-hint {
    position: absolute;
    top: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    background: none;
    border: none;
    color: var(--void-text-faint);
    font-size: 1.2rem;
    cursor: pointer;
    z-index: 10;
    padding: 0.5rem;
    animation: bob-up 2s ease-in-out infinite;
  }

  @keyframes bob-up {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50%       { transform: translateX(-50%) translateY(-4px); }
  }

  .dots {
    position: absolute;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.5rem;
    z-index: 10;
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--void-text-faint);
    border: none;
    cursor: pointer;
    padding: 0;
    transition: background 0.3s ease;
  }

  .dot.active {
    background: var(--void-text-dim);
  }
</style>
