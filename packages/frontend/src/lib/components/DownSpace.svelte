<script lang="ts">
  import { aiAvailable } from '../../../../shared/ai-release.js';
  import { onMount, untrack } from 'svelte';
  import { loadEntries } from '$lib/stores/entries.svelte.js';
  import { loadPatterns } from '$lib/stores/patterns.svelte.js';
  import { loadMemoir } from '$lib/stores/memoir.svelte.js';
  import Timeline from './Timeline.svelte';
  import SoulMap from './SoulMap.svelte';
  import LivingMemoir from './LivingMemoir.svelte';
  import BookReader from './BookReader.svelte';
  import { overlayStore } from '$lib/stores/overlay.svelte.js';
  import { api, isCompanion } from '$lib/api.js';
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
    {#if isCompanion}
      <div class="view" inert={currentView !== 1}><SoulMap /></div>
      <div class="view" inert={currentView !== 2}><LivingMemoir active={active && currentView === 2} /></div>
    {:else}
      <div class="view" inert={currentView !== 1}>{#if currentView===1}<BookReader map/>{/if}</div>
      <div class="view" inert={currentView !== 2}>{#if currentView===2}<BookReader/>{/if}</div>
    {/if}
  </div>

  <!-- Dot indicators -->
  <div class="dots">
    {#each [0, 1, 2] as i}
      <button
        class="dot"
        class:active={currentView === i}
        onclick={() => (currentView = i as View)}
        aria-label={labels[i]+(!aiAvailable && i?' · Coming soon':'')}
        aria-current={currentView === i ? 'page' : undefined}
      >{i === 0 ? 'your words' : labels[i]}{#if !aiAvailable && i}<small>Coming soon</small>{/if}</button>
    {/each}
  </div>
</div>

<style>
  /* Views scroll in the first row; the switcher owns the second, so it never covers content */
  .down-space {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
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
  }

  .dots {
    justify-self: center;
    display: flex;
    gap: var(--space-6);
    padding: var(--space-2) var(--space-5) var(--edge-bottom);
    white-space: nowrap;
  }

  .dot {
    min-width: var(--control);
    min-height: var(--control);
    display: grid;
    place-items: center;
    padding: 0;
    border: none;
    background: none;
    color: var(--ink-subtle);
    font: var(--ui-sm)/1.5 var(--font);
    cursor: pointer;
    transition: color var(--dur-base) var(--ease-soft);
  }

  .dot.active, .dot:hover { color: var(--ink); }
</style>
