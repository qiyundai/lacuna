<script lang="ts">
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
    <p class="whisper">a story still becoming</p>
    <h1>Something like a life.</h1>
    <p class="quiet">Your fragments, gathered into a living memoir.</p>
  </header>
  {#if prose}
    <div class="edition-meta">
      <time class="whisper">{generated ? dateLabel(generated) : ''}{selected ? ' · an earlier telling' : ''}</time>
      <button class="quiet-button" aria-pressed={reading} onclick={() => reading = !reading}>{reading ? 'smaller type' : 'settle in'}</button>
    </div>
    <article class="prose" aria-label="Memoir prose">
      {#each prose.split(/\n\s*\n/).filter(Boolean) as paragraph}<p>{paragraph}</p>{/each}
    </article>
    <div class="end-mark" aria-hidden="true">✧</div>
    <p class="reader-note quiet">A reflection shaped with ChatGPT. The meaning is yours to keep or question.</p>
    <div class="edition-actions">
      <button class="quiet-button" onclick={saveEdition}>take this edition with you</button>
      <button class="quiet-button" aria-expanded={historyOpen} onclick={() => historyOpen = !historyOpen}>{historyOpen ? 'close earlier tellings' : 'earlier tellings'}</button>
    </div>
    {#if historyOpen}
      <div class="edition-history" transition:fade={{ duration: 350 }}>
        <p class="quiet">The story changes as you do. Earlier editions stay here.</p>
        <button class:chosen={!selected} onclick={() => chooseEdition(null)}>the current telling</button>
        {#each editions as edition, i (edition.id)}
          {#if i > 0}
            <button class:chosen={selected?.id === edition.id} onclick={() => chooseEdition(edition)}>
              <time>{dateLabel(edition.generated_at, { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
              <span>{edition.prose.slice(0, 85)}{edition.prose.length > 85 ? '…' : ''}</span>
            </button>
          {/if}
        {/each}
        {#if editions.length <= 1 && !nextCursor}<p class="quiet">This is the first telling. The next will gather as you write.</p>{/if}
        {#if nextCursor}<button disabled={loading} onclick={() => history(nextCursor ?? undefined)}>earlier still</button>{/if}
      </div>
    {/if}
  {:else if memoirStore.status === 'error'}
    <div class="empty-story"><p>Your memoir couldn’t be reached.</p><button class="quiet-button" onclick={loadMemoir}>try again</button></div>
  {:else}
    <div class="empty-story memoir-seed">
      <div class="gathering" aria-hidden="true">{#each Array.from({ length: 20 }) as _, i}<span class:held={i < count} style={`--i:${i}`}></span>{/each}</div>
      <p>There’s room for the unfinished.</p>
      <p class="quiet">{count < 20 ? `Your first memoir begins with 20 thoughts. You’ve held ${count}. For now, let the fragments be fragments.` : 'Your words are ready to gather into a first telling. Let ChatGPT reflect when you’re ready.'}</p>
      {#if count >= 20 && isCompanion}<button class="quiet-button" disabled={refreshing} onclick={reflect}>{refreshing ? 'beginning…' : 'gather a first telling'}</button>{/if}
    </div>
  {/if}
  {#if error}<p role="alert" class="quiet">{error} <button class="quiet-button" onclick={() => history()}>try again</button></p>{/if}
</section>

<style>
  .memoir { max-width: 47rem; }
  .edition-meta { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 3.5rem 0 2.5rem; }
  .quiet-button, .edition-history button { font: inherit; color: var(--void-text-hint); border: 0; background: none; cursor: pointer; line-height: 1.9; transition: color .35s ease; }
  .quiet-button { font-size: .85rem; padding: .4rem 0; }
  button:hover, button.chosen { color: var(--void-text); }
  .prose { max-width: 60ch; margin: auto; }
  .prose p { font: 1.25rem/2 var(--font-reading); color: var(--void-text-dim); margin-bottom: 1.6em; overflow-wrap: anywhere; transition: font-size .4s ease; white-space: pre-line; }
  .prose p:first-child::first-letter { font-size: 3.5em; float: left; line-height: .85; padding: .16em .13em 0 0; color: var(--void-text); }
  .reading .prose p { font-size: 1.55rem; }
  .end-mark { text-align: center; font-size: 1.5rem; color: var(--moss); margin: 3rem 0; }
  .reader-note { text-align: center; font-style: italic; max-width: 34ch; margin: auto; }
  .edition-actions { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-top: 3rem; }
  .edition-history { display: flex; flex-direction: column; gap: 1.5rem; margin-top: 2.5rem; }
  .edition-history button { text-align: left; padding: .5rem 0; }
  .edition-history time { display: block; font-size: .85rem; color: var(--void-text-faint); margin-bottom: .5rem; }
  .edition-history span { font-family: var(--font-reading); font-size: 1.1rem; }
  .memoir-seed { max-width: 34ch; min-height: 30rem; }
  .gathering { width: 8rem; height: 8rem; position: relative; margin-bottom: 2rem; }
  .gathering span { position: absolute; left: 50%; top: 50%; height: 3px; width: 3px; border-radius: 50%; background: var(--hairline); transform: rotate(calc(var(--i) * 18deg)) translateY(-3.7rem); }
  .gathering span.held { background: var(--moss); box-shadow: 0 0 9px color-mix(in srgb, var(--moss) 35%, transparent); }
  @media(max-width: 600px) { .prose p { font-size: 1.15rem; } .reading .prose p { font-size: 1.35rem; } .edition-meta { margin-top: 2.5rem; } }
</style>
