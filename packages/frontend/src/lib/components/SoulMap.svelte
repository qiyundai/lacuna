<script lang="ts">
  import { patternsStore } from '$lib/stores/patterns.svelte.js';
  import { weather } from '$lib/stores/weather.svelte.js';

  function glowRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const MODELS = [
    { id: 'story_thread', label: 'Story / Through-line' },
    { id: 'voices',       label: 'Voices' },
    { id: 'blind_spots',  label: 'Blind Spots' },
    { id: 'unsaid',       label: "What's Unsaid" },
    { id: 'story_loop',   label: 'The Story You Keep Telling' },
    { id: 'where_you_are', label: 'Where You Are' },
  ] as const;

  const TOTAL = MODELS.length;
  const RADIUS = 80;
  const CX = 120;
  const CY = 120;
  const ARC_WIDTH = 10;
  const GAP_ANGLE = 4; // degrees between arcs

  function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number
  ): string {
    const start = polarToXY(cx, cy, r, startAngle);
    const end = polarToXY(cx, cy, r, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  const segmentAngle = (360 - TOTAL * GAP_ANGLE) / TOTAL;

  function getSegment(index: number) {
    const startAngle = index * (segmentAngle + GAP_ANGLE);
    const endAngle = startAngle + segmentAngle;
    return { startAngle, endAngle };
  }

  function getWeight(id: string): number {
    if (!patternsStore.model_weights) return 0;
    const w = (patternsStore.model_weights as Record<string, number | undefined>)[id];
    return typeof w === 'number' ? w : 0;
  }

  function getSummary(id: string): string {
    return patternsStore.model_weights?.summaries?.[id] ?? '';
  }

  type ModelId = typeof MODELS[number]['id'];
  let hoveredModel = $state<ModelId | null>(null);
</script>

<div class="soul-map">
  {#if patternsStore.status === 'loading'}
    <div class="state-message">...</div>
  {:else if !patternsStore.model_weights || Object.keys(patternsStore.model_weights).length === 0}
    <div class="state-message">
      <p>your map forms as you write</p>
      <p class="sub">patterns emerge after 10 entries</p>
    </div>
  {:else}
    <svg viewBox="0 0 240 240" class="map-svg" aria-label="Soul map">
      {#each MODELS as model, i}
        {@const { startAngle, endAngle } = getSegment(i)}
        {@const weight = getWeight(model.id)}
        {@const fillEnd = startAngle + (endAngle - startAngle) * weight}

        <!-- Track (empty arc) -->
        <path
          d={describeArc(CX, CY, RADIUS, startAngle, endAngle)}
          stroke={glowRgba(weather.palette.glows[0], 0.12)}
          stroke-width={ARC_WIDTH}
          fill="none"
          stroke-linecap="round"
        />

        <!-- Fill arc -->
        {#if weight > 0}
          <path
            d={describeArc(CX, CY, RADIUS, startAngle, fillEnd)}
            stroke={weight > 0.5
              ? glowRgba(weather.palette.glows[0], 0.75)
              : glowRgba(weather.palette.glows[1], 0.40)}
            stroke-width={ARC_WIDTH}
            fill="none"
            stroke-linecap="round"
            class:breathing={weight > 0.3}
          />
        {/if}

        <!-- Hit area for hover -->
        <path
          d={describeArc(CX, CY, RADIUS, startAngle, endAngle)}
          stroke="transparent"
          stroke-width={ARC_WIDTH + 12}
          fill="none"
          class="hit-area"
          onmouseenter={() => (hoveredModel = model.id)}
          onmouseleave={() => (hoveredModel = null)}
          ontouchstart={() => (hoveredModel = model.id)}
          ontouchend={() => (hoveredModel = null)}
          role="button"
          tabindex={0}
          aria-label={model.label}
        />
      {/each}
    </svg>

    <!-- Labels -->
    <div class="labels">
      {#each MODELS as model}
        {@const weight = getWeight(model.id)}
        <div
          class="label"
          class:active={weight > 0}
          class:hovered={hoveredModel === model.id}
        >
          <span class="label-text">{model.label}</span>
          {#if hoveredModel === model.id && getSummary(model.id)}
            <span class="label-summary">{getSummary(model.id)}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .soul-map {
    padding: var(--space-8) var(--space-6) var(--space-9);
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-6);
  }

  .state-message {
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    text-align: center;
    padding-top: var(--space-7);
    letter-spacing: var(--ls-ui);
    line-height: var(--lh-prose);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .sub {
    font-size: var(--text-xs);
    color: var(--void-text-faint);
  }

  .map-svg {
    width: min(240px, 60vw);
    height: min(240px, 60vw);
  }

  .hit-area {
    cursor: pointer;
  }

  .breathing {
    animation: breathe 3s ease-in-out infinite;
  }

  @keyframes breathe {
    0%, 100% { opacity: 0.8; }
    50%       { opacity: 1; }
  }

  .labels {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    max-width: 280px;
  }

  .label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    transition: opacity var(--dur-base) var(--ease-soft);
    opacity: 0.5;
  }

  .label.active,
  .label.hovered {
    opacity: 1;
  }

  .label-text {
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-ui);
  }

  .label-summary {
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    line-height: var(--lh-ui);
    font-style: italic;
  }
</style>
