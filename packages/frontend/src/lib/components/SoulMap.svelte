<script lang="ts">
  import { fade } from 'svelte/transition';
  import { storyStore, loadStory } from '$lib/stores/story.svelte.js';
  import { patternsStore } from '$lib/stores/patterns.svelte.js';
  import type { MemoryNode } from '$lib/api.js';
  import ReflectionLenses from './ReflectionLenses.svelte';
  let kind = $state<'theme' | 'emotion' | 'entity'>('theme');
  let selected = $state<MemoryNode | null>(null), lenses = $state(false);
  const nodes = $derived((storyStore.data?.graph.nodes ?? []).filter(n => n.type === kind).sort((a, b) => b.count - a.count || a.concept.localeCompare(b.concept)).slice(0, 12));
  const positions = [[48,45],[23,23],[76,71],[77,21],[22,73],[49,12],[48,83],[15,47],[84,46],[34,59],[64,32],[64,60]];
  const tone = $derived(patternsStore.model_weights?.overall_tone ?? patternsStore.model_weights?.emerging_theme ?? patternsStore.model_weights?.narrative_tone);
  function choose(value: typeof kind) { kind = value; selected = null; }
</script>

<section class="story-page map-page" aria-label="Soul map">
  <header class="story-heading centered">
    <h1>Soul map</h1>
    <p class="quiet">{tone || 'Small recurrences, gradually becoming visible.'}</p>
  </header>
  <div class="quiet-toggles map-modes" role="group" aria-label="Explore your map">
    <button class="quiet-toggle" aria-pressed={!lenses} onclick={() => lenses = false}>constellation</button>
    <button class="quiet-toggle" aria-pressed={lenses} onclick={() => lenses = true}>six lenses</button>
  </div>
  {#if lenses}
    <div class="lens-room" transition:fade={{ duration: 350 }}>
      <p class="quiet">Ways of reading what you’ve written. Select a lens to hear its reflection.</p>
      <ReflectionLenses />
      <p class="quiet">These are interpretations. You decide what feels true.</p>
    </div>
  {:else}
    <div class="quiet-toggles kinds" role="group" aria-label="Concept types">
      <button class="quiet-toggle" aria-pressed={kind === 'theme'} onclick={() => choose('theme')}>threads</button>
      <button class="quiet-toggle" aria-pressed={kind === 'emotion'} onclick={() => choose('emotion')}>feelings</button>
      <button class="quiet-toggle" aria-pressed={kind === 'entity'} onclick={() => choose('entity')}>people & places</button>
    </div>
    <div class="constellation" class:feelings={kind === 'emotion'} class:places={kind === 'entity'}>
      <svg viewBox="0 0 800 480" preserveAspectRatio="none" aria-hidden="true" class="sky">
        <ellipse cx="400" cy="240" rx="287" ry="173" /><ellipse cx="400" cy="240" rx="177" ry="108" />
        {#each [[40,135],[140,370],[313,34],[590,408],[720,190],[610,57],[290,390],[490,132],[183,80],[640,320],[320,220],[550,255]] as star}
          <circle cx={star[0]} cy={star[1]} r="1" />
        {/each}
      </svg>
      {#each nodes as node, i (`${node.type}:${node.concept}`)}
        <button class="star" class:selected={selected?.concept === node.concept && selected?.type === node.type} style={`--x:${positions[i][0]}%;--y:${positions[i][1]}%;--size:${Math.min(12, 5 + Math.sqrt(node.count) * 1.5)}px;`} aria-pressed={selected?.concept === node.concept && selected?.type === node.type} aria-label={`${node.concept}, noticed ${node.count} times`} onclick={() => selected = selected?.concept === node.concept ? null : node}>
          <span class="point" aria-hidden="true"></span><span class="concept" title={node.concept}>{node.concept}</span>
        </button>
      {/each}
      {#if !nodes.length}
        <div class="unformed">
          <span aria-hidden="true">✧</span>
          <p>{storyStore.status === 'error' ? 'Your map couldn’t be reached.' : 'Let a few words find each other.'}</p>
          <p class="quiet">{storyStore.status === 'error' ? 'Your saved thoughts are still here.' : 'Save a thought and let ChatGPT reflect. The first threads can appear right away.'}</p>
          {#if storyStore.status === 'error'}<button class="quiet-toggle" onclick={loadStory}>try again</button>{/if}
        </div>
      {/if}
    </div>
    <div class="constellation-note" aria-live="polite">
      {#if selected}
        <p class="selected-name">{selected.concept}</p>
        <p class="quiet">noticed in {selected.count} {selected.count === 1 ? 'thought' : 'thoughts'}</p>
      {:else if nodes.length}<p class="quiet">Choose a word and notice what it brings back.</p>{/if}
      {#if storyStore.data?.graph.processed_count}<p class="map-footnote">drawn from {storyStore.data.graph.processed_count} reflected {storyStore.data.graph.processed_count === 1 ? 'thought' : 'thoughts'}. size follows recurrence.</p>{/if}
    </div>
  {/if}
</section>

<style>
  .map-page { max-width: 68rem; }
  .centered { text-align: center; }
  .map-modes, .kinds { justify-content: center; }
  .map-modes { column-gap: var(--space-6); }
  .map-modes .quiet-toggle { font-size: var(--ui-md); }
  .kinds { margin-top: var(--space-1); }
  .constellation { height: clamp(26rem, 48vw, 35rem); position: relative; --star-color: var(--lavender); margin: var(--space-4) calc(-1 * var(--space-4)) 0; }
  .constellation.feelings { --star-color: var(--rose); }
  .constellation.places { --star-color: var(--moss); }
  .sky { position: absolute; width: 100%; height: 100%; pointer-events: none; }
  .sky ellipse { stroke: var(--line); stroke-width: .6; fill: none; opacity: .45; }
  .sky circle { fill: var(--ink-subtle); opacity: .35; }
  .star { position: absolute; left: var(--x); top: var(--y); transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: var(--space-2); width: 8rem; min-height: var(--control); padding: var(--space-1); border: 0; background: none; color: var(--ink-subtle); font: inherit; cursor: pointer; transition: color var(--dur-fast) var(--ease-soft); }
  .star:hover, .star.selected { color: var(--ink); }
  .point { width: var(--size); height: var(--size); border-radius: 50%; background: var(--star-color); box-shadow: 0 0 18px color-mix(in srgb, var(--star-color) 24%, transparent); transition: box-shadow var(--dur-slow) var(--ease-soft), transform var(--dur-slow) var(--ease-soft); }
  .concept { max-width: 100%; font: 400 var(--ui-md)/var(--lh-tight) var(--font); letter-spacing: var(--ls-ui); overflow-wrap: anywhere; display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .star.selected .point, .star:hover .point { transform: scale(1.3); box-shadow: 0 0 30px color-mix(in srgb, var(--star-color) 50%, transparent); }
  .constellation-note { min-height: 7rem; text-align: center; }
  .selected-name { font: 400 var(--display-3)/var(--lh-heading) var(--font); letter-spacing: var(--ls-heading); overflow-wrap: anywhere; }
  .map-footnote { margin-top: var(--space-5); font: 400 var(--ui-xs)/var(--lh-ui) var(--font); letter-spacing: var(--ls-ui); color: var(--ink-subtle); }
  .unformed { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4); padding: var(--space-6); text-align: center; }
  .unformed > span { color: var(--lavender); font-size: var(--text-xl); line-height: 1; }
  .unformed > p:not(.quiet) { max-width: 30ch; font: 400 var(--text-xl)/var(--lh-heading) var(--font); letter-spacing: var(--ls-heading); }
  .unformed > p.quiet { max-width: 34ch; }
  .lens-room { margin-top: var(--space-5); text-align: center; }
  .lens-room :global(.soul-map) { padding: var(--space-6) 0; min-height: auto; }
  .lens-room :global(.labels) { max-width: 34rem; text-align: left; display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5) var(--space-6); }
  @media (max-width: 600px) { .star { width: 5.75rem; } .concept { font-size: var(--ui-sm); } .constellation { margin-inline: calc(-1 * var(--space-2)); } .lens-room :global(.labels) { grid-template-columns: 1fr; } }
</style>
