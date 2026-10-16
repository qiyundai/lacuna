<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { loadEntries } from '$lib/stores/entries.svelte.js';
  import { loadPatterns } from '$lib/stores/patterns.svelte.js';
  import { loadMemoir } from '$lib/stores/memoir.svelte.js';
  import Timeline from './Timeline.svelte';
  import SoulMap from './SoulMap.svelte';
  import LivingMemoir from './LivingMemoir.svelte';
  import UserMenu from './UserMenu.svelte';
  import { overlayStore } from '$lib/stores/overlay.svelte.js';
  import { api } from '$lib/api.js';
  import { loadAI } from '$lib/stores/ai.svelte.js';
  import { loadStory } from '$lib/stores/story.svelte.js';

  let { onSwipeUp, active = false }: { onSwipeUp: () => void; active?: boolean } = $props();

  type View = 0 | 1 | 2; // 0=Timeline, 1=SoulMap, 2=LivingMemoir
  let currentView = $state<View>(0);

  let touchStartX = $state(0);
  let touchStartY = 0;

  $effect(() => {
    if (!active) return;
    untrack(() => { loadPatterns(); loadMemoir(); loadStory(); loadAI().catch(() => {}); });
    let polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try { if (!(await api.ai.status()).pending) { loadPatterns(); loadMemoir(); loadStory(); clearInterval(timer); } await loadAI(); } catch { clearInterval(timer); }
      finally { polling = false; }
    }, 5000);
    return () => clearInterval(timer);
  });

  onMount(() => {
    loadEntries();
    loadPatterns();
    loadMemoir();
    loadStory();
  });

  function touchStart(e: TouchEvent) {
    if ((e.target as Element).closest('button, input, textarea, a') || e.touches.length !== 1) { touchStartX = NaN; return; }
    touchStartX = e.touches[0]!.clientX;
    touchStartY = e.touches[0]!.clientY;
  }

  function touchEnd(e: TouchEvent) {
    if (!Number.isFinite(touchStartX) || !e.changedTouches[0]) return;
    const deltaX = touchStartX - e.changedTouches[0]!.clientX;
    if (Math.abs(touchStartY - e.changedTouches[0]!.clientY) >= Math.abs(deltaX)) return;
    if (Math.abs(deltaX) < 50) return;
    if (deltaX > 0 && currentView < 2) currentView = (currentView + 1) as View;
    else if (deltaX < 0 && currentView > 0) currentView = (currentView - 1) as View;
  }

  const labels = ['timeline', 'soul map', 'memoir'];
</script>

<div
  class="down-space"
  class:menu-open={overlayStore.open}
  ontouchstart={touchStart}
  ontouchend={touchEnd}
  role="region"
  aria-label="Your story"
>
  <UserMenu />

  <!-- Up hint -->
  <button class="up-hint" onclick={onSwipeUp} aria-label="Return to void">
    <span>↑</span>
  </button>

  <!-- View container -->
  <div class="views" style="transform: translateX(-{currentView * 100}vw)">
    <div class="view" inert={currentView !== 0}><Timeline /></div>
    <div class="view" inert={currentView !== 1}><SoulMap /></div>
    <div class="view" inert={currentView !== 2}><LivingMemoir active={active && currentView === 2} /></div>
  </div>

  <!-- Dot indicators -->
  <div class="dots">
    {#each [0, 1, 2] as i}
      <button
        class="dot"
        class:active={currentView === i}
        onclick={() => (currentView = i as View)}
        aria-label={labels[i]}
        aria-current={currentView === i ? 'page' : undefined}
      >{i === 0 ? 'your words' : labels[i]}</button>
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
    transition: filter var(--dur-slow) var(--ease-soft);
  }

  .down-space.menu-open {
    filter: blur(12px);
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
    top: var(--space-5);
    left: 50%;
    transform: translateX(-50%);
    background: none;
    border: none;
    color: var(--void-text-faint);
    font-size: var(--text-md);
    cursor: pointer;
    z-index: 10;
    padding: var(--space-2);
  }

  @keyframes bob-up {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50%       { transform: translateX(-50%) translateY(-4px); }
  }

  .dots {
    position: absolute;
    bottom: var(--space-5);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2rem;
    z-index: 10;
    padding: .6rem 1.5rem;
    white-space: nowrap;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
  }

  .dot {
    min-width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    color: var(--void-text-hint);
    font: .8rem/1.8 var(--font-serif);
    transition: background var(--dur-base) var(--ease-soft);
  }

  .dot.active { color: var(--void-text); }
  .dot:hover { color: var(--void-text); }
</style>
