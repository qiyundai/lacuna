<script lang="ts">
  import { aiAvailable } from '../../../../shared/ai-release.js';
  import { onMount, untrack } from 'svelte';
  import { loadEntries } from '$lib/stores/entries.svelte.js';
  import { loadPatterns } from '$lib/stores/patterns.svelte.js';
  import { loadMemoir } from '$lib/stores/memoir.svelte.js';
  import Timeline from './Timeline.svelte';
  import BookReader from './BookReader.svelte';
  import { overlayStore } from '$lib/stores/overlay.svelte.js';
  import { api } from '$lib/api.js';
  import { loadAI } from '$lib/stores/ai.svelte.js';
  import { loadStory } from '$lib/stores/story.svelte.js';

  let { active = false, initial=0 }: { active?: boolean; initial?:0|1|2 } = $props();

  type View = 0 | 1 | 2; // 0=Timeline, 1=SoulMap, 2=LivingMemoir
  let currentView = $state<View>(0);

  let touchStartX = $state(0);
  let touchStartY = 0;

  $effect(() => {
    if (!active || !aiAvailable) return;
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
    currentView=initial;
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
  <div class="views" style="transform: translateX(-{currentView * 100}vw)">
    <div class="view" inert={currentView !== 0}><Timeline /></div>
    <div class="view" inert={currentView !== 1}>{#if currentView===1}<BookReader map/>{/if}</div>
    <div class="view" inert={currentView !== 2}>{#if currentView===2}<BookReader/>{/if}</div>
  </div>

  <!-- Dot indicators -->
  <nav class="dots" aria-label="Story views">
    {#each [0, 1, 2] as i}
      <button
        class="quiet-toggle dot"
        onclick={() => (currentView = i as View)}
        aria-label={labels[i]+(!aiAvailable && i?' · Coming soon':'')}
        aria-current={currentView === i ? 'page' : undefined}
      >{i === 0 ? 'your words' : labels[i]}{#if !aiAvailable && i}<small>soon</small>{/if}</button>
    {/each}
  </nav>
</div>

<style>
  /* Views scroll in the first row; the switcher owns the second, so it never covers content */
  .down-space {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    /* Pin the track to the viewport so a wide row of tabs can never stretch the views */
    grid-template-columns: minmax(0, 1fr);
    background: var(--paper);
    overflow: hidden;
    transition: filter var(--dur-slow) var(--ease-soft);
  }

  .down-space.menu-open { filter: blur(12px); }

  .views {
    display: flex;
    width: 300%;
    min-height: 0;
    transition: transform var(--dur-base) var(--ease-soft);
    will-change: transform;
  }

  .view {
    width: calc(100% / 3);
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: var(--line) transparent;
    /* Words soften into the page edge above the view switcher instead of being cut */
    mask-image: linear-gradient(to bottom, var(--ink) calc(100% - var(--space-7)), transparent);
  }

  .dots {
    justify-self: center;
    max-width: 100%;
    display: flex;
    gap: var(--space-6);
    padding: 0 var(--gutter) var(--edge-bottom);
  }

  /* A label and its quiet note share one line, so every tab sits on the same baseline */
  .dot { align-items: baseline; gap: var(--space-1); }
  .dot small { font-size: var(--ui-xs); font-style: italic; color: var(--ink-subtle); }
  @media (max-width: 420px) { .dots { gap: var(--space-4); } }
</style>
