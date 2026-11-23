<script lang="ts">
  import { aiAvailable } from '../../../../shared/ai-release.js';
  import { untrack, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { memoirStore, loadMemoir } from '$lib/stores/memoir.svelte.js';
  import { storyStore } from '$lib/stores/story.svelte.js';
  import { aiStore } from '$lib/stores/ai.svelte.js';
  import { api, isCompanion, type MemoirEdition } from '$lib/api.js';
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { dateLabel, downloadFile } from '$lib/story.js';
  import { sessionVersion } from '$lib/session-version.js';
  let { active = false }: { active?: boolean } = $props();
  let editions = $state<MemoirEdition[]>([]), selected = $state<MemoirEdition | null>(null);
  let nextCursor = $state<string | null>(null), historyOpen = $state(false), reading = $state(false);
  let loading = $state(false), error = $state(''), refreshing = $state(false);
  let historyRequest = 0;
  let room: HTMLElement;
  async function chooseEdition(edition: MemoirEdition | null) {
    selected = edition;
    await tick();
    room?.parentElement?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  const count = $derived(storyStore.data?.summary.total ?? aiStore.entryCount);
  const prose = $derived(selected?.prose ?? memoirStore.prose);
  const generated = $derived(selected?.generated_at ?? memoirStore.generated_at);
  $effect(() => {
    const stamp = memoirStore.generated_at;
    if (active) untrack(() => { void stamp; if (!memoirStore.prose) selected = null; void history(); });
  });
  async function history(cursor?: string) {
    const version = sessionVersion.value, request = ++historyRequest;
    loading = true; error = '';
    try {
      const page = await api.memoir.history(cursor);
      if (version !== sessionVersion.value || request !== historyRequest) return;
      editions = cursor ? [...editions, ...page.editions] : page.editions;
      nextCursor = page.nextCursor;
    } catch { if (request === historyRequest) error = 'Could not load earlier editions. Try again.'; }
    finally { if (request === historyRequest) loading = false; }
  }
  async function reflect() {
    if (refreshing) return;
    refreshing = true; error = '';
    try { await companionRequest('reflect', 'POST'); }
    catch { error = 'Could not start a reflection. Check your ChatGPT connection in the menu.'; }
    finally { refreshing = false; }
  }
  function saveEdition() {
    if (prose) downloadFile(`# Living memoir\n\n${generated ? dateLabel(generated) : ''}\n\n${prose}\n`, 'lacuna-memoir.md', 'text/markdown;charset=utf-8');
  }
</script>

<section class="story-page memoir" class:reading aria-label="Living memoir" bind:this={room}>
  <header class="story-heading">
    <h1>Living memoir</h1>
    <p class="quiet">Your fragments, gathered into a living memoir.</p>
  </header>
  {#if prose}
    <div class="edition-meta">
      <time class="whisper">{generated ? dateLabel(generated) : ''}{selected ? ' · an earlier telling' : ''}</time>
      <button class="quiet-toggle" aria-pressed={reading} onclick={() => reading = !reading}>{reading ? 'smaller type' : 'settle in'}</button>
    </div>
    <article class="prose" aria-label="Memoir prose">
      {#each prose.split(/\n\s*\n/).filter(Boolean) as paragraph}<p>{paragraph}</p>{/each}
    </article>
    <div class="end-mark" aria-hidden="true">✧</div>
    <p class="reader-note quiet">A reflection shaped with ChatGPT. The meaning is yours to keep or question.</p>
    <div class="edition-actions">
      <button class="quiet-toggle" onclick={saveEdition}>take this edition with you</button>
      <button class="quiet-toggle" aria-expanded={historyOpen} onclick={() => historyOpen = !historyOpen}>{historyOpen ? 'close earlier tellings' : 'earlier tellings'}</button>
    </div>
    {#if historyOpen}
      <div class="edition-history" transition:fade={{ duration: 350 }}>
        <p class="quiet">The story changes as you do. Earlier editions stay here.</p>
        <button class="edition" aria-pressed={!selected} onclick={() => chooseEdition(null)}><span>the current telling</span></button>
        {#each editions as edition, i (edition.id)}
          {#if i > 0}
            <button class="edition" aria-pressed={selected?.id === edition.id} onclick={() => chooseEdition(edition)}>
              <time>{dateLabel(edition.generated_at, { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
              <span>{edition.prose.slice(0, 85)}{edition.prose.length > 85 ? '…' : ''}</span>
            </button>
          {/if}
        {/each}
        {#if editions.length <= 1 && !nextCursor}<p class="quiet">This is the first telling. The next will gather as you write.</p>{/if}
        {#if nextCursor}<button class="quiet-toggle" disabled={loading} onclick={() => history(nextCursor ?? undefined)}>earlier still</button>{/if}
      </div>
    {/if}
  {:else if memoirStore.status === 'error'}
    <div class="empty-story"><p>Your memoir couldn’t be reached.</p><button class="quiet-toggle" onclick={loadMemoir}>try again</button></div>
  {:else}
    <div class="empty-story memoir-seed">
      <div class="gathering" aria-hidden="true">{#each Array.from({ length: 20 }) as _, i}<span class:held={i < count} style={`--i:${i}`}></span>{/each}</div>
      <p>There’s room for the unfinished.</p>
      <p class="quiet">{!aiAvailable ? 'Living Memoir · Coming soon' : count < 20 ? `Your first memoir begins with 20 thoughts. You’ve held ${count}. For now, let the fragments be fragments.` : 'Your words are ready to gather into a first telling. Let ChatGPT reflect when you’re ready.'}</p>
      {#if aiAvailable && count >= 20 && isCompanion}<button class="quiet-toggle" disabled={refreshing} onclick={reflect}>{refreshing ? 'beginning…' : 'gather a first telling'}</button>{/if}
    </div>
  {/if}
  {#if error}<p role="alert" class="quiet">{error} <button class="quiet-toggle" onclick={() => history()}>try again</button></p>{/if}
</section>

<style>
  .memoir { max-width: 42rem; }
  .edition-meta { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-5); padding-bottom: var(--space-2); border-bottom: 1px solid var(--rule); }
  .prose p { margin-bottom: 1.5em; font: 400 var(--text-lg)/1.9 var(--font); letter-spacing: var(--ls-prose); color: var(--ink-muted); overflow-wrap: anywhere; white-space: pre-line; text-wrap: pretty; transition: font-size var(--dur-base) var(--ease-soft); }
  .prose p:first-child::first-letter { float: left; margin: .08em .1em 0 0; font-size: 3.6em; line-height: .8; color: var(--ink); }
  @supports (initial-letter: 2) {
    .prose p:first-child::first-letter { float: none; margin: 0 .12em 0 0; font-size: inherit; line-height: inherit; initial-letter: 2; }
  }
  .reading .prose p { font-size: var(--text-xl); line-height: 1.8; }
  .end-mark { margin: var(--space-7) 0 var(--space-5); text-align: center; font-size: var(--text-md); color: var(--moss); }
  .reader-note { max-width: 34ch; margin: 0 auto; text-align: center; font-style: italic; }
  .edition-actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-7); padding-top: var(--space-2); border-top: 1px solid var(--rule); }
  .edition-history { display: grid; margin-top: var(--space-4); }
  .edition-history > .quiet { margin-bottom: var(--space-3); }
  .edition { display: grid; gap: var(--space-1); padding: var(--space-4) 0; border: 0; border-top: 1px solid var(--rule); background: none; color: var(--ink-muted); font: inherit; text-align: left; cursor: pointer; transition: color var(--dur-fast) var(--ease-soft); }
  .edition:hover, .edition[aria-pressed=true] { color: var(--ink); }
  .edition time { font: 400 var(--ui-sm)/var(--lh-ui) var(--font); letter-spacing: var(--ls-ui); color: var(--ink-subtle); }
  .edition span { font: 400 var(--text-md)/var(--lh-ui) var(--font); }
  .memoir-seed { max-width: 34ch; min-height: 30rem; }
  .gathering { width: 8rem; height: 8rem; position: relative; margin-bottom: var(--space-5); }
  .gathering span { position: absolute; left: 50%; top: 50%; height: 3px; width: 3px; border-radius: 50%; background: var(--line); transform: rotate(calc(var(--i) * 18deg)) translateY(-3.7rem); }
  .gathering span.held { background: var(--moss); box-shadow: 0 0 9px color-mix(in srgb, var(--moss) 35%, transparent); }
</style>
