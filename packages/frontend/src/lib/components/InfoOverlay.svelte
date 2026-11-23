<script lang="ts">
  import { aiAvailable } from '../../../../shared/ai-release.js';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/modal.js';
  import { isCompanion } from '$lib/api.js';

  let { show = $bindable(false) }: { show: boolean } = $props();

  function dismiss() { show = false; }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') dismiss(); }} />

{#if show}
  <div
    use:modal={{ dismiss }}
    class="sheet-screen"
    transition:fade={{ duration: 400, easing: cubicOut }}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="What is Lacuna"
    onclick={e => { if (e.target === e.currentTarget) dismiss(); }}
    onkeydown={(e) => { if (e.key === 'Escape') dismiss(); }}
  >
    <div class="journal-sheet">
      <h2>About Lacuna</h2>
      <p>Each page has an address in the city. Select its building to read it again.</p>
      <p>Soul Map and Living Memoir · Coming soon. Your journal already holds every saved page.</p>
      <p>Quiet writing gives you a blank page. Hold to save, or press Control or Command and Enter.</p>
      <p>Find encrypted sync and backups in Journal settings → Privacy &amp; storage. Choose Export journal to download a readable copy.</p>
      {#if aiAvailable && isCompanion}<section>
        <p class="note">as you write, we read through six lenses — not to label you, but to find the shape of what keeps returning.</p>

        <ul class="lenses">
          <li>
            <span class="lens-label">Story / Through-line</span>
            <span class="lens-desc">the thread running through everything you write — your personal myth</span>
          </li>
          <li>
            <span class="lens-label">Voices</span>
            <span class="lens-desc">the parts of you that pull in different directions, the contradictions</span>
          </li>
          <li>
            <span class="lens-label">Blind Spots</span>
            <span class="lens-desc">what you consistently circle around but never quite say</span>
          </li>
          <li>
            <span class="lens-label">What's Unsaid</span>
            <span class="lens-desc">persistent absences — the recurring negations and shadow themes</span>
          </li>
          <li>
            <span class="lens-label">The Story You Keep Telling</span>
            <span class="lens-desc">a self-narrative that keeps reappearing, and the threads that could change it</span>
          </li>
          <li>
            <span class="lens-label">Where You Are</span>
            <span class="lens-desc">the life-stage underneath the words — belonging, legacy, identity, purpose</span>
          </li>
        </ul>

        <p class="note">these lenses shape your soul map and, in time, the living memoir — a piece of prose that becomes more honest the longer you stay.</p>
      </section>{/if}

      <div class="sheet-foot"><button class="atlas-link" onclick={dismiss}>Close</button></div>
    </div>
  </div>
{/if}

<style>
  .lenses{list-style:none;display:grid;gap:var(--space-4)}
  .lenses li{display:grid;gap:var(--space-1)}
  .lens-label{font:400 var(--ui-lg)/var(--lh-tight) var(--font);color:var(--ink)}
  .lens-desc{font:400 var(--ui-sm)/var(--lh-ui) var(--font);color:var(--ink-subtle)}
</style>
