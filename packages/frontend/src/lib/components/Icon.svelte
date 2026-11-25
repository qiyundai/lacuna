<script module lang="ts">
  /*
   * The single icon set. 24×24 grid, round caps and joins, stroke drawn at
   * --icon-stroke. Glyphs marked `solid` are filled (transport controls).
   * Pass `off` to strike a glyph through: the slash cuts a gap in the glyph
   * instead of being drawn on top of it.
   */
  type Glyph = string | { d: string; solid?: true; weight?: number };
  const glyphs = {
    // Navigation and scene
    search: 'M16.5 10.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1.8 4.3L21 21',
    pages: 'M7 3.5h11a1.5 1.5 0 0 1 1.5 1.5v13H8a2 2 0 0 0 0 4h11.5M6 20V5a1.5 1.5 0 0 1 1.5-1.5M10 8h6M10 11h4',
    city: 'M2 20h20M4 20V9l4-3 4 3v11m0-8h7v8M7 11v2m2 3v3m6-4v2',
    resident: 'M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 13l2-4 3-1 2 4 3 1M12 10l-1 5 4 3 1 4m-5-7-2 4-3 3',
    overlook: 'm2 18 7-11 5 8 3-5 5 8H2Zm4.5-7 2.5 2 2.3-2',
    town: 'm3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7',
    journal: 'M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14',
    quiet: 'M4 21 17 8M6 18c-1-7 3-14 14-15 .5 8-3 14-9 14H7',
    settings: 'M4 6h8m5 0h3M4 12h2m5 0h9M4 18h9m5 0h2M12 4v4M7 10v4M14 16v4',
    privacy: 'M12 2.8 20 6v5c0 5-3.4 8.4-8 11-4.6-2.6-8-6-8-11V6ZM8.5 12l2.5 2.5 4.8-5',
    info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6m0-10v.2',
    leave: 'M10 4H4v16h6m-1-8h12m-5-5 5 5-5 5',
    back: 'M20 12H4m7-7-7 7 7 7',
    write: 'm4 16 12-12a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L8 20l-5 1 1-5Zm10-10 4 4M4 16l4 4',
    retry: 'M20 10a8 8 0 1 0-1 7M20 4v6h-6',
    play: 'm7 4 12 8-12 8Z',
    pause: 'M8 5v14M16 5v14',
    close: 'M6 6l12 12M18 6 6 18',
    'chevron-left': 'm15 5-7 7 7 7',
    'chevron-right': 'm9 5 7 7-7 7',
    // Sound
    volume: 'M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
    music: 'M9 17V6l11-2v11M9 9l11-2M9 17a3.2 2.5 0 1 1-6.4 0 3.2 2.5 0 1 1 6.4 0Zm11-2a3.2 2.5 0 1 1-6.4 0 3.2 2.5 0 1 1 6.4 0Z',
    ambience: 'M2 9q3-4 6 0t6 0 6 0M2 15q3-4 6 0t6 0 6 0',
    library: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM6.5 12a5.5 5.5 0 0 1 5.5-5.5',
    // Music player
    'play-solid': { d: 'M7 4 20 12 7 20Z', solid: true },
    'pause-solid': { d: 'M8 5v14M16 5v14', weight: 3.5 },
    next: 'm5 5 10 7-10 7zM19 5v14',
    previous: 'm19 5-10 7 10 7zM5 5v14',
    shuffle: 'M3 6h2c5 0 8 12 13 12h3m-3-3 3 3-3 3M3 18h2c2.5 0 4-2 5-4m4-5c1.5-2 2.5-3 4-3h3m-3-3 3 3-3 3',
    repeat: 'M3 10V8a3 3 0 0 1 3-3h13m-3-3 3 3-3 3M21 14v2a3 3 0 0 1-3 3H5m3 3-3-3 3-3',
    expand: 'm5 14 7-7 7 7',
    minimize: 'm5 9 7 7 7-7',
    plus: 'M12 5v14M5 12h14',
    queue: 'M3 5h14M3 10h14M3 15h6m7-2v8m-4-4h8',
    remove: 'M5 12h14'
  } satisfies Record<string, Glyph>;
  export type IconName = keyof typeof glyphs;
  const SLASH = 'M3.5 3.5 20.5 20.5';
</script>

<script lang="ts">
  let { name, size, off = false }: { name: IconName; size?: number; off?: boolean } = $props();
  const maskId = $props.id();
  const glyph = $derived.by(() => { const g: Glyph = glyphs[name]; return typeof g === 'string' ? { d: g } : g; });
</script>

<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" style:--icon-size={size ? size + 'px' : undefined}
  fill={glyph.solid ? 'currentColor' : 'none'} stroke="currentColor" style:stroke-width={glyph.weight ?? 'var(--icon-stroke)'}
  stroke-linecap="round" stroke-linejoin="round">
  {#if off}
    <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
      <rect width="24" height="24" fill="#fff" stroke="none"/>
      <path d={SLASH} stroke="#000" stroke-width="5"/>
    </mask>
    <path d={glyph.d} mask="url(#{maskId})"/>
    <path d={SLASH}/>
  {:else}
    <path d={glyph.d}/>
  {/if}
</svg>

<style>
  /* Size follows --icon-size, so a container can scale every icon inside it. */
  .icon { inline-size: var(--icon-size, var(--icon)); block-size: var(--icon-size, var(--icon)); flex: none; overflow: visible; }
</style>
