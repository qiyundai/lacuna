<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { draft, appendText, insertAt, deleteRange, deleteChar, clearDraft, type DraftChar } from '$lib/stores/draft.svelte.js';
  import { weather } from '$lib/stores/weather.svelte.js';
  import { holdDetector } from '$lib/gesture.js';
  import { api } from '$lib/api.js';
  import { prependEntry } from '$lib/stores/entries.svelte.js';

  let { onSwipeDown }: { onSwipeDown: () => void } = $props();

  const MAX_CHARS = 500;

  let inputEl = $state<HTMLTextAreaElement | undefined>(undefined);
  let container = $state<HTMLDivElement | undefined>(undefined);
  let solidifying = $state(false);
  let solidifyProgress = $state(0);
  let justSolidified = $state(false);
  let dissolving = $state(false);
  let scattering = $state(false);
  let keyboardShift = $state(0);

  let showIntro = $state(false);
  let introVisible = $state(false);
  let introTimer: ReturnType<typeof setTimeout> | null = null;

  let hintArmed = $state(false);
  let showHoldHint = $state(false);
  let holdHintVisible = $state(false);
  let holdHintTimer: ReturnType<typeof setTimeout> | null = null;
  let holdHintRevealTimer: ReturnType<typeof setTimeout> | null = null;

  function dismissIntro() {
    if (introTimer) clearTimeout(introTimer);
    introTimer = null;
    introVisible = false;
    setTimeout(() => { showIntro = false; }, 800);
  }

  function dismissHoldHint() {
    if (holdHintTimer) clearTimeout(holdHintTimer);
    if (holdHintRevealTimer) clearTimeout(holdHintRevealTimer);
    holdHintTimer = null;
    holdHintRevealTimer = null;
    holdHintVisible = false;
    setTimeout(() => { showHoldHint = false; }, 600);
  }

  function scheduleHoldHint() {
    if (holdHintTimer) clearTimeout(holdHintTimer);
    holdHintTimer = setTimeout(() => {
      if (!draft.isDirty) return;
      showHoldHint = true;
      holdHintRevealTimer = setTimeout(() => {
        holdHintVisible = true;
        holdHintRevealTimer = null;
      }, 30);
      holdHintTimer = null;
    }, 3000);
  }

  let gestureCleanup: (() => void) | null = null;
  let isMobile = false;

  let cursorPos = $state(0);
  let cursorVisible = $state(false);
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;
  let focused = $state(false);
  const showCursor = $derived(focused || cursorVisible);
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
      dismissHoldHint();
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

  function onEscapeKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && draft.isDirty && !scattering) {
      scattering = true;
      setTimeout(() => { clearDraft(); scattering = false; }, SCATTER_MS);
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    focusInput();

    if (container) {
      const hold = holdDetector(container, {
        durationMs: 600,
        onHoldStart: () => {
          if (!draft.isDirty) return;
          if (holdHintVisible) dismissHoldHint();
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

    window.addEventListener('keydown', onEscapeKey);
    window.addEventListener('visibilitychange', focusInput);
    document.addEventListener('selectionchange', handleSelectionChange);

    rafId = requestAnimationFrame(tick);

    if (!localStorage.getItem('lacuna_intro_shown')) {
      localStorage.setItem('lacuna_intro_shown', '1');
      showIntro = true;
      setTimeout(() => { introVisible = true; }, 50);
      introTimer = setTimeout(dismissIntro, 5500);
    }

    if (!localStorage.getItem('lacuna_hint_learned')) {
      hintArmed = true;
    }

    window.visualViewport?.addEventListener('resize', handleViewportResize);
    handleViewportResize();
  });

  onDestroy(() => {
    gestureCleanup?.();
    if (rafId) cancelAnimationFrame(rafId);
    if (refractRafId) cancelAnimationFrame(refractRafId);
    if (cursorTimer) clearTimeout(cursorTimer);
    if (holdHintTimer) clearTimeout(holdHintTimer);
    if (holdHintRevealTimer) clearTimeout(holdHintRevealTimer);
    if (container) container.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('keydown', onEscapeKey);
    window.removeEventListener('visibilitychange', focusInput);
    document.removeEventListener('selectionchange', handleSelectionChange);
    window.visualViewport?.removeEventListener('resize', handleViewportResize);
  });

  function focusInput() {
    inputEl?.focus();
  }

  function startRefract() {
    // Skip on mobile — animating the SVG displacement filter on the glow-field
    // every frame for 2.8s is too expensive on mobile GPUs.
    if (isMobile || reducedMotion) return;
    if (refractRafId) cancelAnimationFrame(refractRafId);
    const start = performance.now();
    const peak = REFRACT_PEAK;
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

    await commitEntry(text, solidifiedAt);
  }

  async function commitEntry(text: string, solidifiedAt: number) {
    dissolving = true;
    justSolidified = true;
    startRefract();
    if (isMobile) inputEl?.blur();

    if (hintArmed) {
      hintArmed = false;
      localStorage.setItem('lacuna_hint_learned', '1');
      dismissHoldHint();
    }

    setTimeout(() => {
      clearDraft();
      dissolving = false;
      solidifying = false;
      solidifyProgress = 0;
      if (isMobile) focusInput();
    }, DISSOLVE_MS + 400);

    setTimeout(() => (justSolidified = false), RIPPLE_MS);

    try {
      const { entry } = await api.entries.create(text, solidifiedAt);
      prependEntry(entry);
    } catch (err) {
      console.error('Failed to save entry:', err);
    }
  }

  const charsLeft = $derived(MAX_CHARS - draft.chars.length);
  const nearLimit = $derived(charsLeft <= 80);

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    if (dissolving || scattering) {
      target.value = draft.text;
      return;
    }

    let newVal = target.value;
    if (newVal.length > MAX_CHARS) newVal = newVal.slice(0, MAX_CHARS);
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

    if (hintArmed && draft.isDirty) {
      if (showHoldHint) dismissHoldHint();
      scheduleHoldHint();
    }
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

  function handleViewportResize() {
    if (!window.visualViewport) return;
    keyboardShift = Math.max(0, window.innerHeight - window.visualViewport.height) / 2;
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
    --void-text-hint: {weather.palette.textFaint};
    --glow-0: {weather.palette.glows[0]};
    --glow-1: {weather.palette.glows[1]};
    --glow-2: {weather.palette.glows[2]};
    --keyboard-shift: {keyboardShift}px;
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

  {#if draft.isDirty || showCursor}
    <div
      class="draft-prose"
      class:empty={!draft.isDirty}
      class:condensing={solidifying}
      class:dissolving
      class:scattering
      style="--condense-progress: {solidifyProgress}"
    >
      {#if draft.isDirty}
        {#each words as word (word.id)}
          {#if word.isSpace}
            {#each word.chars as entry (entry.char.id)}
              {#if showCursor && !hasSelection && entry.idx === cursorPos}
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
                {#if showCursor && !hasSelection && entry.idx === cursorPos}
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
        {#if showCursor && !hasSelection && cursorPos >= draft.chars.length}
          <span class="cursor" aria-hidden="true"></span>
        {/if}
      {:else}
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
      class:with-empty-cursor={showCursor && !draft.isDirty}
      aria-hidden="true"
    >
      <span>type anything</span>
      <span>hold to keep it</span>
      <span>swipe down to see your story</span>
    </div>
  {/if}

  {#if showHoldHint}
    <div
      class="hold-hint"
      class:visible={holdHintVisible && !solidifying}
      aria-hidden="true"
    >
      <svg class="hold-hint-ring" viewBox="0 0 100 100" width="80" height="80" aria-hidden="true">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--void-text)" stroke-width="1.5" opacity="0.15" />
        <circle
          class="hold-hint-arc"
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="var(--void-text)"
          stroke-width="1.5"
          stroke-dasharray="251"
          stroke-dashoffset="251"
          stroke-linecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span class="hold-hint-label">hold to solidify</span>
    </div>
  {/if}

  <textarea
    bind:this={inputEl}
    class="hidden-input"
    autocomplete="off"
    autocapitalize="off"
    spellcheck={false}
    {...{ autocorrect: 'off' }}
    maxlength={MAX_CHARS}
    oninput={handleInput}
    onkeydown={handleKeyDown}
    onfocus={() => { focused = true; }}
    onblur={() => { focused = false; }}
    onclick={focusInput}
    ontouchend={handleTouchEnd}
    onselectstart={(e) => e.preventDefault()}
    value={draft.text}
    aria-label="Write here"
  ></textarea>

  {#if nearLimit}
    <div class="char-limit" aria-live="polite">{charsLeft}</div>
  {/if}

  <button class="down-hint" class:faint={draft.isDirty} onclick={onSwipeDown} aria-label="Go to your story">
    <span>↓</span>
  </button>

</div>

<style>
  .void {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--bg);
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
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
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .draft-prose {
    position: absolute;
    top: calc(50% - var(--keyboard-shift, 0px));
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 38ch;
    width: 80%;
    text-align: center;
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-void);
    line-height: var(--lh-prose);
    letter-spacing: var(--ls-prose);
    pointer-events: none;
    user-select: none;
    word-break: break-word;
    white-space: pre-wrap;
    z-index: 2;
    transition: opacity 0.3s ease, top 0.25s ease;
  }

  .draft-prose.condensing {
    transform: translate(-50%, -50%) scale(calc(1 - var(--condense-progress) * 0.15));
    opacity: calc(1 - var(--condense-progress) * 0.3);
    filter: blur(calc(var(--condense-progress) * 6px));
  }

  .draft-prose.empty {
    line-height: 1;
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
    .cursor { animation: none; }
    .hold-hint-arc { animation: none; stroke-dashoffset: 0; }
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
    /* No blur filter — softness is encoded in the gradient stops. Blurring a
       260vmax element on mobile is extremely expensive on the GPU. */
    will-change: transform, opacity;
    z-index: 1;
  }

  .ripple-primary {
    background: radial-gradient(
      circle,
      transparent 0%,
      transparent 30%,
      color-mix(in srgb, var(--glow-0) 4%, transparent) 35%,
      color-mix(in srgb, var(--glow-0) 22%, transparent) 41%,
      color-mix(in srgb, var(--glow-0) 46%, transparent) 46%,
      color-mix(in srgb, var(--glow-0) 22%, transparent) 51%,
      color-mix(in srgb, var(--glow-0) 4%, transparent) 57%,
      transparent 63%,
      transparent 100%
    );
    animation: rippleOut 2.8s cubic-bezier(0.33, 0, 0.25, 1) forwards;
  }

  .ripple-secondary {
    background: radial-gradient(
      circle,
      transparent 0%,
      transparent 36%,
      color-mix(in srgb, var(--glow-1) 3%, transparent) 40%,
      color-mix(in srgb, var(--glow-1) 13%, transparent) 44%,
      color-mix(in srgb, var(--glow-1) 26%, transparent) 47%,
      color-mix(in srgb, var(--glow-1) 13%, transparent) 50%,
      color-mix(in srgb, var(--glow-1) 3%, transparent) 54%,
      transparent 59%,
      transparent 100%
    );
    animation: rippleOut 2.8s cubic-bezier(0.33, 0, 0.25, 1) 320ms forwards;
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
    bottom: var(--space-6);
    left: 50%;
    transform: translateX(-50%);
    background: none;
    border: none;
    color: var(--void-text-faint);
    font-size: var(--text-md);
    cursor: pointer;
    animation: bob 2s ease-in-out infinite;
    user-select: none;
    z-index: 3;
    padding: var(--space-2);
  }

  @keyframes bob {
    0%, 100% { transform: translateX(-50%) translateY(0); }
    50%       { transform: translateX(-50%) translateY(4px); }
  }

  .cursor {
    display: inline-block;
    width: 1.5px;
    height: 1.1em;
    background: var(--void-text);
    opacity: 0.5;
    margin-left: 1px;
    vertical-align: middle;
    animation: cursorBlink 1.1s step-end infinite;
  }

  @keyframes cursorBlink {
    0%, 100% { opacity: 0.5; }
    50%       { opacity: 0; }
  }

  .char.selected,
  .char-space.selected {
    background: rgba(255, 255, 220, 0.18);
    border-radius: 2px;
  }

  .down-hint.faint {
    opacity: 0.12;
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
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    line-height: 2.2;
    letter-spacing: var(--ls-label);
    pointer-events: none;
    user-select: none;
    z-index: 2;
    opacity: 0;
    transition: opacity var(--dur-slow) var(--ease-soft);
  }

  .intro-hint.visible {
    opacity: 1;
  }

  .intro-hint.with-empty-cursor {
    top: calc(50% + 4.5rem);
  }

  .intro-hint span {
    display: block;
  }

  .hold-hint {
    position: absolute;
    bottom: 22%;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    pointer-events: none;
    user-select: none;
    z-index: 2;
    opacity: 0;
    transition: opacity var(--dur-slow) var(--ease-soft);
  }

  .hold-hint.visible {
    opacity: 1;
  }

  .hold-hint-ring {
    display: block;
    overflow: visible;
  }

  .hold-hint-arc {
    animation: ringDraw 1.8s linear infinite;
  }

  @keyframes ringDraw {
    0%   { stroke-dashoffset: 251; }
    85%  { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: 0; }
  }

  .hold-hint-label {
    display: block;
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
    text-align: center;
  }

  .char-limit {
    position: absolute;
    bottom: var(--space-6);
    right: var(--space-5);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
    color: var(--void-text-hint);
    pointer-events: none;
    user-select: none;
    z-index: 3;
    animation: fadeIn 0.6s ease forwards;
    opacity: 0;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .cursor { animation: none; }
    .hold-hint-arc { animation: none; stroke-dashoffset: 0; }
  }
</style>
