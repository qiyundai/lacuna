<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { draft, appendText, insertAt, deleteRange, deleteChar, clearDraft, type DraftChar } from '$lib/stores/draft.svelte.js';
  import { weather } from '$lib/stores/weather.svelte.js';
  import { holdDetector, shakeDetector } from '$lib/gesture.js';
  import { api } from '$lib/api.js';
  import { prependEntry } from '$lib/stores/entries.svelte.js';
  import InfoOverlay from './InfoOverlay.svelte';

  let { onSwipeDown }: { onSwipeDown: () => void } = $props();

  let inputEl = $state<HTMLTextAreaElement | undefined>(undefined);
  let container = $state<HTMLDivElement | undefined>(undefined);
  let solidifying = $state(false);
  let solidifyProgress = $state(0);
  let justSolidified = $state(false);
  let dissolving = $state(false);
  let showingConsent = $state(false);
  let scattering = $state(false);
  let pendingText = '';
  let pendingAt = 0;

  let showInfo = $state(false);
  let showIntro = $state(false);
  let introVisible = $state(false);
  let introTimer: ReturnType<typeof setTimeout> | null = null;

  function dismissIntro() {
    if (introTimer) clearTimeout(introTimer);
    introTimer = null;
    introVisible = false;
    setTimeout(() => { showIntro = false; }, 800);
  }

  let gestureCleanup: (() => void) | null = null;
  let shakeCleanup: (() => void) | null = null;

  let cursorPos = $state(0);
  let cursorVisible = $state(false);
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;
  let selStart = $state(0);
  let selEnd = $state(0);
  const hasSelection = $derived(selStart < selEnd);

  function showCursorBriefly() {
    cursorVisible = true;
    if (cursorTimer) clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => { cursorVisible = false; }, 1500);
  }

  function handleSelectionChange() {
    if (!inputEl || document.activeElement !== inputEl) return;
    selStart = inputEl.selectionStart ?? 0;
    selEnd = inputEl.selectionEnd ?? 0;
    cursorPos = selEnd;
  }

  const orbEls: HTMLDivElement[] = [];
  const orbs = [
    { baseX: 18, baseY: 22, size: 62, ampX: 10, ampY: 8,  freqX: 0.00022, freqY: 0.00018, freqS: 0.00015, phaseX: 0.0, phaseY: 1.1, phaseS: 0.3, baseOpacity: 0.55, parallax: 0.6, glowIndex: 0 },
    { baseX: 78, baseY: 72, size: 70, ampX: 12, ampY: 10, freqX: 0.00020, freqY: 0.00028, freqS: 0.00019, phaseX: 2.3, phaseY: 0.4, phaseS: 1.5, baseOpacity: 0.50, parallax: 0.7, glowIndex: 1 },
    { baseX: 58, baseY: 30, size: 48, ampX: 14, ampY: 9,  freqX: 0.00033, freqY: 0.00021, freqS: 0.00024, phaseX: 4.1, phaseY: 2.8, phaseS: 2.7, baseOpacity: 0.48, parallax: 0.4, glowIndex: 2 },
    { baseX: 28, baseY: 72, size: 54, ampX: 11, ampY: 12, freqX: 0.00019, freqY: 0.00031, freqS: 0.00017, phaseX: 1.7, phaseY: 3.5, phaseS: 4.1, baseOpacity: 0.50, parallax: 0.8, glowIndex: 1 },
    { baseX: 72, baseY: 28, size: 42, ampX: 15, ampY: 13, freqX: 0.00029, freqY: 0.00016, freqS: 0.00026, phaseX: 5.2, phaseY: 4.6, phaseS: 0.9, baseOpacity: 0.42, parallax: 0.9, glowIndex: 0 },
    { baseX: 48, baseY: 58, size: 60, ampX: 8,  ampY: 10, freqX: 0.00024, freqY: 0.00026, freqS: 0.00021, phaseX: 3.3, phaseY: 0.9, phaseS: 5.4, baseOpacity: 0.46, parallax: 0.3, glowIndex: 2 },
    { baseX: 38, baseY: 45, size: 38, ampX: 13, ampY: 11, freqX: 0.00027, freqY: 0.00023, freqS: 0.00029, phaseX: 0.8, phaseY: 2.2, phaseS: 3.6, baseOpacity: 0.48, parallax: 0.5, glowIndex: 0 },
    { baseX: 64, baseY: 82, size: 48, ampX: 10, ampY: 14, freqX: 0.00021, freqY: 0.00025, freqS: 0.00018, phaseX: 2.9, phaseY: 4.0, phaseS: 1.8, baseOpacity: 0.42, parallax: 0.6, glowIndex: 1 },
  ];

  let pointerX = 0.5;
  let pointerY = 0.5;
  let smoothPx = 0.5;
  let smoothPy = 0.5;
  let reducedMotion = false;
  let rafId = 0;

  let displaceEl = $state<SVGFEDisplacementMapElement | undefined>(undefined);
  let refractRafId = 0;
  const REFRACT_PEAK = 38;
  const RIPPLE_MS = 2800;
  const DISSOLVE_MS = 1100;
  const SCATTER_MS = 700;

  let glowBoost = 0;
  let lastTickTime = 0;
  const GLOW_DECAY_PER_SEC = 1.5;

  const driftCache = new Map<number, { dx: number; dy: number; dur: number; delay: number; sx: number; sy: number }>();
  function driftFor(id: number) {
    let d = driftCache.get(id);
    if (!d) {
      const sign = () => (Math.random() < 0.5 ? 1 : -1);
      d = {
        dx: (Math.random() - 0.5) * 14,
        dy: (Math.random() - 0.5) * 14,
        dur: 9 + Math.random() * 6,
        delay: -Math.random() * 10,
        sx: sign() * (80 + Math.random() * 40),
        sy: sign() * (80 + Math.random() * 40),
      };
      driftCache.set(id, d);
    }
    return d;
  }

  type CharEntry = { char: DraftChar; idx: number };
  type Token = { id: number; chars: CharEntry[]; isSpace: boolean };
  const words = $derived.by<Token[]>(() => {
    const tokens: Token[] = [];
    let current: Token | null = null;
    let idx = 0;
    for (const c of draft.chars) {
      const isSpace = /\s/.test(c.ch);
      const entry: CharEntry = { char: c, idx: idx++ };
      if (current && current.isSpace === isSpace) {
        current.chars.push(entry);
      } else {
        current = { id: c.id, chars: [entry], isSpace };
        tokens.push(current);
      }
    }
    return tokens;
  });

  $effect(() => {
    if (draft.chars.length === 0) {
      driftCache.clear();
      selStart = 0;
      selEnd = 0;
      cursorPos = 0;
      cursorVisible = false;
    }
  });

  function tick() {
    const t = performance.now();
    const dt = lastTickTime ? Math.min((t - lastTickTime) / 1000, 0.05) : 0.016;
    lastTickTime = t;

    smoothPx += (pointerX - smoothPx) * 0.06;
    smoothPy += (pointerY - smoothPy) * 0.06;

    if (solidifying) {
      glowBoost = solidifyProgress;
    } else if (glowBoost > 0.001) {
      glowBoost *= Math.exp(-GLOW_DECAY_PER_SEC * dt);
    } else {
      glowBoost = 0;
    }

    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i];
      const el = orbEls[i];
      if (!el) continue;

      let dx = 0;
      let dy = 0;
      let sizeMod = 0;
      if (!reducedMotion) {
        dx = Math.sin(t * orb.freqX + orb.phaseX) * orb.ampX
           + Math.cos(t * orb.freqX * 0.3) * orb.ampX * 0.4;
        dy = Math.cos(t * orb.freqY + orb.phaseY) * orb.ampY
           + Math.sin(t * orb.freqY * 0.4) * orb.ampY * 0.4;
        sizeMod = Math.sin(t * orb.freqS + orb.phaseS) * 0.28
                + Math.cos(t * orb.freqS * 0.7 + orb.phaseS * 0.5) * 0.12;
      }
      const parallaxMag = reducedMotion ? 0.3 : 1;
      dx += (smoothPx - 0.5) * orb.parallax * 4 * parallaxMag;
      dy += (smoothPy - 0.5) * orb.parallax * 4 * parallaxMag;

      const scale = 1 + sizeMod + glowBoost * 0.08;
      const opacity = orb.baseOpacity * (1 + glowBoost * 0.4);

      el.style.transform = `translate(-50%, -50%) translate3d(${dx}vw, ${dy}vh, 0) scale(${scale})`;
      el.style.opacity = String(opacity);
    }

    rafId = requestAnimationFrame(tick);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    pointerX = (e.clientX - rect.left) / rect.width;
    pointerY = (e.clientY - rect.top) / rect.height;
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    focusInput();

    if (container) {
      const hold = holdDetector(container, {
        durationMs: 600,
        onHoldStart: () => {
          if (!draft.isDirty) return;
          solidifying = true;
          const start = Date.now();
          const tickProgress = () => {
            solidifyProgress = Math.min((Date.now() - start) / 600, 1);
            if (solidifyProgress < 1 && solidifying) requestAnimationFrame(tickProgress);
          };
          requestAnimationFrame(tickProgress);
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
      container.addEventListener('pointermove', handlePointerMove);
    }

    const shake = shakeDetector(() => {
      if (!draft.isDirty || scattering) return;
      scattering = true;
      setTimeout(() => {
        clearDraft();
        scattering = false;
      }, SCATTER_MS);
    });
    shakeCleanup = shake.destroy;

    window.addEventListener('visibilitychange', focusInput);
    document.addEventListener('selectionchange', handleSelectionChange);

    rafId = requestAnimationFrame(tick);

    if (!localStorage.getItem('lacuna_intro_shown')) {
      localStorage.setItem('lacuna_intro_shown', '1');
      showIntro = true;
      setTimeout(() => { introVisible = true; }, 50);
      introTimer = setTimeout(dismissIntro, 5500);
    }
  });

  onDestroy(() => {
    gestureCleanup?.();
    shakeCleanup?.();
    if (rafId) cancelAnimationFrame(rafId);
    if (refractRafId) cancelAnimationFrame(refractRafId);
    if (container) container.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('visibilitychange', focusInput);
    document.removeEventListener('selectionchange', handleSelectionChange);
  });

  function focusInput() {
    inputEl?.focus();
  }

  function startRefract() {
    if (refractRafId) cancelAnimationFrame(refractRafId);
    const start = performance.now();
    const peak = reducedMotion ? REFRACT_PEAK * 0.3 : REFRACT_PEAK;
    const step = () => {
      const t = (performance.now() - start) / RIPPLE_MS;
      if (!displaceEl) return;
      if (t >= 1) {
        displaceEl.setAttribute('scale', '0');
        refractRafId = 0;
        return;
      }
      const env = Math.sin(t * Math.PI);
      const eased = env * env * (3 - 2 * env);
      displaceEl.setAttribute('scale', String(eased * peak));
      refractRafId = requestAnimationFrame(step);
    };
    refractRafId = requestAnimationFrame(step);
  }

  async function solidifyEntry() {
    const text = draft.text.trim();
    if (!text) {
      solidifying = false;
      solidifyProgress = 0;
      return;
    }

    const solidifiedAt = Math.floor(Date.now() / 1000);

    if (!localStorage.getItem('lacuna_ai_consented')) {
      pendingText = text;
      pendingAt = solidifiedAt;
      solidifying = false;
      solidifyProgress = 0;
      showingConsent = true;
      return;
    }

    await commitEntry(text, solidifiedAt);
  }

  async function dismissConsent() {
    localStorage.setItem('lacuna_ai_consented', '1');
    showingConsent = false;
    await commitEntry(pendingText, pendingAt);
  }

  async function commitEntry(text: string, solidifiedAt: number) {
    dissolving = true;
    justSolidified = true;
    startRefract();

    setTimeout(() => {
      clearDraft();
      dissolving = false;
      solidifying = false;
      solidifyProgress = 0;
    }, DISSOLVE_MS + 400);

    setTimeout(() => (justSolidified = false), RIPPLE_MS);

    try {
      const { entry } = await api.entries.create(text, solidifiedAt);
      prependEntry(entry);
    } catch (err) {
      console.error('Failed to save entry:', err);
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    if (dissolving || scattering) {
      target.value = draft.text;
      return;
    }

    const newVal = target.value;
    const oldVal = draft.text;
    const newCursorPos = target.selectionStart ?? newVal.length;

    if (newVal !== oldVal) {
      // Find common prefix and suffix to isolate the changed region
      let pfx = 0;
      while (pfx < oldVal.length && pfx < newVal.length && oldVal[pfx] === newVal[pfx]) pfx++;
      let oldEnd = oldVal.length;
      let newEnd = newVal.length;
      while (oldEnd > pfx && newEnd > pfx && oldVal[oldEnd - 1] === newVal[newEnd - 1]) { oldEnd--; newEnd--; }

      if (oldEnd > pfx) deleteRange(pfx, oldEnd);
      if (newEnd > pfx) insertAt(pfx, newVal.slice(pfx, newEnd));
    }

    target.value = draft.text;
    target.setSelectionRange(newCursorPos, newCursorPos);
    cursorPos = newCursorPos;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (dissolving || scattering) {
      e.preventDefault();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!draft.isDirty) return;
      solidifying = true;
      const start = performance.now();
      const CONDENSE_MS = 220;
      const animateCondense = () => {
        solidifyProgress = Math.min((performance.now() - start) / CONDENSE_MS, 1);
        if (solidifyProgress < 1) {
          requestAnimationFrame(animateCondense);
        } else {
          solidifyEntry();
        }
      };
      requestAnimationFrame(animateCondense);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pos = inputEl?.selectionStart ?? draft.text.length;
      insertAt(pos, '\n');
      if (inputEl) {
        inputEl.value = draft.text;
        inputEl.setSelectionRange(pos + 1, pos + 1);
        cursorPos = pos + 1;
      }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      setTimeout(() => {
        if (inputEl) {
          cursorPos = inputEl.selectionStart ?? draft.text.length;
          showCursorBriefly();
        }
      }, 0);
    }
  }

  function handleTouchEnd() {
    setTimeout(() => inputEl?.focus(), 0);
  }
</script>

<div
  class="void"
  class:solidifying
  bind:this={container}
  role="main"
  style="
    --bg: {weather.palette.base};
    --void-text: {weather.palette.text};
    --void-text-faint: {weather.palette.textFaint};
    --glow-0: {weather.palette.glows[0]};
    --glow-1: {weather.palette.glows[1]};
    --glow-2: {weather.palette.glows[2]};
  "
>
  <svg class="filter-defs" aria-hidden="true" width="0" height="0">
    <defs>
      <filter id="glow-refract" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.009 0.013"
          numOctaves="2"
          seed="7"
          result="noise"
        />
        <feDisplacementMap
          bind:this={displaceEl}
          in="SourceGraphic"
          in2="noise"
          scale="0"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </defs>
  </svg>

  <div class="glow-field">
    {#each orbs as orb, i}
      <div
        class="glow"
        bind:this={orbEls[i]}
        style="
          left: {orb.baseX}%;
          top: {orb.baseY}%;
          width: {orb.size}vmin;
          height: {orb.size}vmin;
          transform: translate(-50%, -50%);
          background-image: radial-gradient(circle, var(--glow-{orb.glowIndex}) 0%, transparent 65%);
          opacity: {orb.baseOpacity};
        "
      ></div>
    {/each}
  </div>

  {#if draft.isDirty}
    <div
      class="draft-prose"
      class:condensing={solidifying}
      class:dissolving
      class:scattering
      style="--condense-progress: {solidifyProgress}"
    >
      {#each words as word (word.id)}
        {#if word.isSpace}
          {#each word.chars as entry (entry.char.id)}
            {#if cursorVisible && !hasSelection && entry.idx === cursorPos}
              <span class="cursor" aria-hidden="true"></span>
            {/if}
            <span
              class="char char-space"
              class:selected={hasSelection && entry.idx >= selStart && entry.idx < selEnd}
              style="--char-index: {entry.idx}"
            >{entry.char.ch}</span>
          {/each}
        {:else}
          {@const drift = driftFor(word.id)}
          <span
            class="word"
            style="--drift-x: {drift.dx}px; --drift-y: {drift.dy}px; --drift-dur: {drift.dur}s; --drift-delay: {drift.delay}s; --scatter-x: {drift.sx}px; --scatter-y: {drift.sy}px;"
          >
            {#each word.chars as entry (entry.char.id)}
              {#if cursorVisible && !hasSelection && entry.idx === cursorPos}
                <span class="cursor" aria-hidden="true"></span>
              {/if}
              <span
                class="char"
                class:selected={hasSelection && entry.idx >= selStart && entry.idx < selEnd}
                style="--char-index: {entry.idx}"
              >{entry.char.ch}</span>
            {/each}
          </span>
        {/if}
      {/each}
      {#if cursorVisible && !hasSelection && cursorPos >= draft.chars.length}
        <span class="cursor" aria-hidden="true"></span>
      {/if}
    </div>
  {/if}

  {#if justSolidified}
    <div class="ripple ripple-primary"></div>
    <div class="ripple ripple-secondary"></div>
  {/if}

  {#if showIntro}
    <div
      class="intro-hint"
      class:visible={introVisible && !draft.isDirty}
      aria-hidden="true"
    >
      <span>type anything</span>
      <span>hold to keep it</span>
      <span>swipe down to see your story</span>
    </div>
  {/if}

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

  {#if showingConsent}
    <button class="consent-overlay" onclick={dismissConsent} aria-label="Understood, continue">
      <p class="consent-text">your words are analyzed privately to surface patterns in your story. this uses anthropic's api — they process entries but do not store them for training.</p>
      <span class="consent-hint">tap to continue</span>
    </button>
  {/if}

  {#if !showingConsent}
    <button class="down-hint" class:faint={draft.isDirty} onclick={onSwipeDown} aria-label="Go to your story">
      <span>↓</span>
    </button>
  {/if}

  {#if !showingConsent && !draft.isDirty}
    <button
      class="void-what-is-this"
      onclick={() => (showInfo = true)}
      aria-label="What is Lacuna"
    >what is this</button>
  {/if}

  <InfoOverlay bind:show={showInfo} />
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
    transition: background 1.6s ease;
  }

  .filter-defs {
    position: absolute;
    width: 0;
    height: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .glow-field {
    position: absolute;
    inset: 0;
    pointer-events: none;
    filter: blur(55px) saturate(1.15) url(#glow-refract);
    mix-blend-mode: screen;
    will-change: filter;
  }

  .glow {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    will-change: transform, opacity;
    transition: background-image 1.6s ease;
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

  .draft-prose {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 38ch;
    width: 80%;
    text-align: center;
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: clamp(1.1rem, 2.6vw, 1.5rem);
    line-height: 1.6;
    letter-spacing: 0.02em;
    pointer-events: none;
    user-select: none;
    word-break: break-word;
    white-space: pre-wrap;
    z-index: 2;
    transition: opacity 0.3s ease;
  }

  .draft-prose.condensing {
    transform: translate(-50%, -50%) scale(calc(1 - var(--condense-progress) * 0.15));
    opacity: calc(1 - var(--condense-progress) * 0.3);
    filter: blur(calc(var(--condense-progress) * 6px));
  }

  .word {
    display: inline-block;
    will-change: transform;
    animation: drift var(--drift-dur) ease-in-out infinite alternate;
    animation-delay: var(--drift-delay);
  }

  .char {
    display: inline-block;
    will-change: opacity, transform, filter;
    animation: charIn 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .char-space {
    display: inline;
    animation: charSpaceIn 520ms ease-out both;
  }

  .draft-prose.dissolving {
    animation: proseDissolve 1100ms cubic-bezier(0.4, 0, 0.6, 1) forwards;
  }

  .draft-prose.scattering .word {
    animation: wordScatter 700ms cubic-bezier(0.22, 0, 0.36, 1) forwards;
  }

  @keyframes wordScatter {
    0%   { opacity: 1;   filter: blur(0px);   transform: translate(0, 0); }
    60%  { opacity: 0.6; filter: blur(4px);   transform: translate(calc(var(--scatter-x) * 0.6), calc(var(--scatter-y) * 0.6)); }
    100% { opacity: 0;   filter: blur(10px);  transform: translate(var(--scatter-x), var(--scatter-y)); }
  }

  @keyframes charIn {
    from { opacity: 0; transform: translateY(10px); filter: blur(3px); }
    to   { opacity: 1; transform: translateY(0); filter: blur(0); }
  }

  @keyframes charSpaceIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes proseDissolve {
    from { opacity: 0.7; filter: blur(6px);  transform: translate(-50%, -50%) scale(0.85); }
    to   { opacity: 0;   filter: blur(20px); transform: translate(-50%, calc(-50% - 16px)) scale(0.75); }
  }

  @keyframes drift {
    from { transform: translate(0, 0); }
    to   { transform: translate(var(--drift-x), var(--drift-y)); }
  }

  @media (prefers-reduced-motion: reduce) {
    .word { animation: none; }
    .char { animation: charSpaceIn 140ms ease-out both; }
    .draft-prose.condensing { filter: none; }
    .draft-prose.dissolving { animation: proseFade 400ms ease-out forwards; }
    .draft-prose.scattering .word { animation: scatterFade 300ms ease-out forwards; }
    @keyframes proseFade {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
    @keyframes scatterFade {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
    .ripple-primary,
    .ripple-secondary { animation-duration: 1400ms; }
  }

  .ripple {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 260vmax;
    height: 260vmax;
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    mix-blend-mode: screen;
    filter: blur(8px);
    z-index: 1;
  }

  .ripple-primary {
    background: radial-gradient(
      circle,
      transparent 0%,
      transparent 32%,
      color-mix(in srgb, var(--glow-0) 6%, transparent) 37%,
      color-mix(in srgb, var(--glow-0) 24%, transparent) 42%,
      color-mix(in srgb, var(--glow-0) 48%, transparent) 46%,
      color-mix(in srgb, var(--glow-0) 24%, transparent) 50%,
      color-mix(in srgb, var(--glow-0) 6%, transparent) 55%,
      transparent 60%,
      transparent 100%
    );
    animation: rippleOut 2.8s cubic-bezier(0.33, 0, 0.25, 1) forwards;
  }

  .ripple-secondary {
    background: radial-gradient(
      circle,
      transparent 0%,
      transparent 38%,
      color-mix(in srgb, var(--glow-1) 4%, transparent) 42%,
      color-mix(in srgb, var(--glow-1) 14%, transparent) 45%,
      color-mix(in srgb, var(--glow-1) 4%, transparent) 48%,
      transparent 52%,
      transparent 100%
    );
    animation: rippleOut 2.8s cubic-bezier(0.33, 0, 0.25, 1) 320ms forwards;
    filter: blur(16px);
  }

  @keyframes rippleOut {
    0%   { transform: translate(-50%, -50%) scale(0); opacity: 0; }
    8%   { opacity: 0.35; }
    28%  { opacity: 0.55; }
    70%  { opacity: 0.28; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
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

  .consent-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: none;
    cursor: pointer;
    z-index: 10;
    padding: 2rem;
    animation: fadeInConsent 0.6s ease forwards;
  }

  .consent-text {
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: clamp(0.85rem, 2vw, 1rem);
    line-height: 1.7;
    letter-spacing: 0.03em;
    max-width: 34ch;
    text-align: center;
    margin: 0;
  }

  .consent-hint {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    opacity: 0.6;
  }

  @keyframes fadeInConsent {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .cursor {
    display: inline-block;
    width: 1.5px;
    height: 1.1em;
    background: var(--void-text);
    opacity: 0.5;
    margin-left: 1px;
    vertical-align: middle;
  }

  .char.selected,
  .char-space.selected {
    background: rgba(255, 255, 220, 0.18);
    border-radius: 2px;
  }

  .down-hint.faint {
    opacity: 0.12;
  }

  .void-what-is-this {
    position: absolute;
    bottom: 2rem;
    left: 1.5rem;
    background: none;
    border: none;
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    cursor: pointer;
    padding: 0.5rem;
    opacity: 0.5;
    z-index: 3;
    transition: opacity 0.3s ease, color 0.3s ease;
    user-select: none;
  }

  .void-what-is-this:hover,
  .void-what-is-this:focus {
    opacity: 1;
    color: var(--void-text-dim);
    outline: none;
  }

  .intro-hint {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: clamp(0.8rem, 2vw, 0.95rem);
    line-height: 2.2;
    letter-spacing: 0.06em;
    pointer-events: none;
    user-select: none;
    z-index: 2;
    opacity: 0;
    transition: opacity 0.8s ease;
  }

  .intro-hint.visible {
    opacity: 0.7;
  }

  .intro-hint span {
    display: block;
  }
</style>
