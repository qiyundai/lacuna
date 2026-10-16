<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { entriesStore, loadEntries, loadMoreEntries } from '$lib/stores/entries.svelte.js';
  import { storyStore, loadStory } from '$lib/stores/story.svelte.js';
  import { loadPatterns } from '$lib/stores/patterns.svelte.js';
  import { loadMemoir } from '$lib/stores/memoir.svelte.js';
  import { api, type EntryData } from '$lib/api.js';
  import { dateLabel, groupThoughts } from '$lib/story.js';
  import { modal } from '$lib/modal.js';
  import { overlayStore } from '$lib/stores/overlay.svelte.js';
  import { sessionVersion } from '$lib/session-version.js';

  let query = $state(''), kept = $state(false), searching = $state(false);
  let results = $state<EntryData[]>([]), nextCursor = $state<string | null>(null);
  let loading = $state(false), error = $state('');
  let selected = $state<EntryData | null>(null), busy = $state(false), confirming = $state(false);
  let detailError = $state('');
  let requestId = 0;
  const filtered = $derived(!!query.trim() || kept);
  const entries = $derived(filtered ? results : entriesStore.entries);
  const groups = $derived(groupThoughts(entries));
  $effect(() => {
    const search = query.trim(), close = kept;
    const id = ++requestId;
    if (!search && !close) { loading = false; error = ''; return; }
    results = []; nextCursor = null; error = '';
    loading = true;
    const timer = setTimeout(() => searchEntries(search, close, id), 250);
    return () => clearTimeout(timer);
  });
  async function searchEntries(search: string, close: boolean, id: number, cursor?: string) {
    const version = sessionVersion.value;
    error = '';
    try {
      const page = await api.entries.list(cursor, { query: search, kept: close });
      if (id !== requestId || version !== sessionVersion.value) return;
      results = cursor ? [...results, ...page.entries] : page.entries;
      nextCursor = page.nextCursor;
    } catch { if (id === requestId) error = 'Could not search your thoughts. Try again.'; }
    finally { if (id === requestId) loading = false; }
  }
  function earlier() {
    if (!filtered) return loadMoreEntries();
    if (loading || !nextCursor) return;
    loading = true; void searchEntries(query.trim(), kept, requestId, nextCursor);
  }
  function open(entry: EntryData) { selected = entry; confirming = false; detailError = ''; }
  function close() { if (!busy) selected = null; }
  $effect(() => { if (selected) { overlayStore.open = true; return () => { overlayStore.open = false; }; } });
  async function keepThought() {
    if (!selected || busy) return;
    const version = sessionVersion.value;
    busy = true; detailError = '';
    try {
      const { entry } = await api.entries.keep(selected.id, !selected.kept_at);
      if (version !== sessionVersion.value) return;
      selected = entry;
      entriesStore.entries = entriesStore.entries.map(e => e.id === entry.id ? entry : e);
      results = results.map(e => e.id === entry.id ? entry : e).filter(e => !kept || !!e.kept_at);
      void loadStory();
    } catch { detailError = 'Could not change this thought. Try again.'; }
    finally { busy = false; }
  }
  async function removeThought() {
    if (!selected || busy) return;
    const id = selected.id, version = sessionVersion.value;
    busy = true; detailError = '';
    try {
      await api.entries.delete(id);
      if (version !== sessionVersion.value) return;
      entriesStore.entries = entriesStore.entries.filter(e => e.id !== id);
      results = results.filter(e => e.id !== id);
      selected = null;
      void loadStory(); void loadPatterns(); void loadMemoir();
    } catch { detailError = 'Could not delete this thought. Try again.'; }
    finally { busy = false; }
  }
</script>

<section class="timeline story-page" aria-label="Your thoughts">
  <header class="story-heading">
    <p class="whisper">your words, in their own time</p>
    <h1>The things you’ve held.</h1>
    {#if storyStore.data?.summary.total}
      <p class="quiet">{storyStore.data.summary.total} {storyStore.data.summary.total === 1 ? 'thought' : 'thoughts'} gathered{#if storyStore.data.summary.first_at} since {dateLabel(storyStore.data.summary.first_at, { month: 'long', year: 'numeric' })}{/if}.</p>
    {:else}<p class="quiet">A place to return to what you meant.</p>{/if}
  </header>
  <div class="archive-controls">
    <div class="filters" aria-label="Filter thoughts">
      <button class:chosen={!kept} aria-pressed={!kept} onclick={() => kept = false}>everything</button>
      <button class:chosen={kept} aria-pressed={kept} onclick={() => kept = true}>kept close{#if storyStore.data?.summary.kept} <span>{storyStore.data.summary.kept}</span>{/if}</button>
    </div>
    <button aria-expanded={searching} onclick={() => { searching = !searching; if (!searching) query = ''; }}>find a word</button>
  </div>
  {#if searching}
    <div class="search-line" transition:fade={{ duration: 250 }}>
      <input type="search" aria-label="Search all your thoughts" placeholder="a person, a place, a feeling…" bind:value={query} maxlength="200" />
      {#if query}<button onclick={() => query = ''}>clear</button>{/if}
    </div>
  {/if}
  {#if error}<p class="quiet" role="alert">{error} <button onclick={() => searchEntries(query.trim(), kept, requestId)}>try again</button></p>{/if}
  {#if loading || (entriesStore.status === 'loading' && !entries.length)}<p class="quiet waiting" role="status">gathering your words…</p>
  {:else if !entries.length}
    <div class="empty-story">
      <span class="seed" aria-hidden="true">✧</span>
      <p>{filtered ? 'No thoughts here yet.' : 'Every story begins with a fragment.'}</p>
      <p class="quiet">{query ? 'Try another word, or clear your search.' : kept ? 'Open a thought and choose “keep close” to find it here.' : 'Return to the void. Write what’s here, then hold to let it settle.'}</p>
      {#if entriesStore.status === 'error'}<button onclick={loadEntries}>try loading again</button>{/if}
    </div>
  {:else}
    {#each groups as group (group.key)}
      <section class="month" aria-label={group.label}>
        <h2>{group.label}</h2>
        <div class="thoughts">
          {#each group.entries as entry (entry.id)}
            <button class="thought" onclick={() => open(entry)} aria-label={`Read thought from ${dateLabel(entry.created_at)}: ${entry.body.slice(0, 60)}`}>
              <time datetime={new Date(entry.created_at * 1000).toISOString()}>{dateLabel(entry.created_at, { day: 'numeric', weekday: 'short' })}</time>
              <span class="words">{entry.body}</span>
              <span class="kept-mark" aria-label={entry.kept_at ? 'Kept close' : undefined}>{entry.kept_at ? '✧' : ''}</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
    {#if filtered ? nextCursor : entriesStore.nextCursor}<button class="earlier" disabled={loading || entriesStore.status === 'loading'} onclick={earlier}>a little earlier</button>{/if}
    {#if !filtered && entriesStore.status === 'error'}<p class="quiet">Could not load earlier thoughts. <button onclick={earlier}>try again</button></p>{/if}
  {/if}
</section>

{#if selected}
  <div class="thought-screen" use:modal={{ dismiss: close }} role="dialog" aria-modal="true" aria-label="A thought you held" tabindex="-1" onclick={e => { if (e.target === e.currentTarget) close(); }} onkeydown={e => { if (e.key === 'Escape') close(); }} transition:fade={{ duration: 400, easing: cubicOut }}>
    <article class="thought-reader">
      <time class="whisper">{dateLabel(selected.created_at)}</time>
      <p class="held-words">{selected.body}</p>
      <div class="thought-actions">
        <button disabled={busy} aria-pressed={!!selected.kept_at} onclick={keepThought}>{selected.kept_at ? '✧ kept close' : '✧ keep close'}</button>
        <button disabled={busy} onclick={() => confirming = !confirming}>let this go</button>
      </div>
      {#if confirming}
        <div class="release" transition:fade={{ duration: 250 }}>
          <p>This permanently deletes this thought and clears reflections that may contain it. Your other thoughts stay.</p>
          <button class="danger" disabled={busy} onclick={removeThought}>delete this thought</button>
          <button disabled={busy} onclick={() => confirming = false}>keep it here</button>
        </div>
      {/if}
      {#if detailError}<p role="alert" class="quiet">{detailError}</p>{/if}
      <button class="back" disabled={busy} onclick={close}>return to your words</button>
    </article>
  </div>
{/if}

<style>
  .archive-controls, .filters { display: flex; align-items: center; gap: 1.8rem; }
  .archive-controls { justify-content: space-between; margin: 3.3rem 0 2rem; flex-wrap: wrap; gap: .8rem; }
  button { background: none; border: none; color: var(--void-text-hint); font: inherit; cursor: pointer; line-height: 1.8; transition: color .3s ease; }
  .archive-controls button { font-size: .9rem; padding: .5rem 0; }
  button:hover, button.chosen { color: var(--void-text); }
  .filters span { margin-left: .4rem; color: var(--moss); }
  .search-line { display: flex; gap: 1rem; margin: 0 0 2.5rem; }
  input { width: 100%; background: none; border: none; border-bottom: 1px solid var(--hairline); padding: .8rem 0; color: var(--void-text); font: inherit; font-size: 1.2rem; border-radius: 0; }
  input::placeholder { color: var(--void-text-faint); }
  .month { display: grid; grid-template-columns: 9rem 1fr; gap: 2rem; margin: 3rem 0 4rem; }
  h2 { font-size: .95rem; font-weight: 400; color: var(--void-text-hint); padding-top: .3rem; }
  .thoughts { display: flex; flex-direction: column; gap: 2.7rem; }
  .thought { display: grid; grid-template-columns: 4rem 1fr 1rem; gap: 1rem; text-align: left; width: 100%; }
  .thought time { font-size: .8rem; color: var(--void-text-faint); padding-top: .3rem; }
  .words { font-family: var(--font-reading); font-size: clamp(1.1rem, 1.7vw, 1.35rem); line-height: 1.85; color: var(--void-text-dim); white-space: pre-wrap; overflow-wrap: anywhere; transition: color .3s ease; }
  .thought:hover .words { color: var(--void-text); }
  .kept-mark { color: var(--moss); font-size: 1.2rem; }
  .earlier { display: block; margin: 3rem auto; padding: .8rem; }
  .waiting { padding: 3rem 0; }
  .thought-screen { position: fixed; inset: 0; z-index: 220; overflow-y: auto; display: flex; align-items: safe center; justify-content: center; background: color-mix(in srgb, var(--bg) 95%, transparent); backdrop-filter: blur(22px); padding: 5rem 1.5rem; }
  .thought-reader { width: min(100%, 36rem); text-align: center; }
  .held-words { margin: 2rem 0 2.5rem; font: clamp(1.4rem, 3vw, 2rem)/1.8 var(--font-reading); white-space: pre-wrap; overflow-wrap: anywhere; }
  .thought-actions { display: flex; gap: 2rem; justify-content: center; }
  .thought-actions button[aria-pressed="true"] { color: var(--moss); }
  .back { display: block; margin: 3rem auto 0; font-size: .85rem; }
  .release { margin-top: 2rem; font-size: .95rem; line-height: 1.9; color: var(--void-text-hint); }
  .release button { margin: 1rem .8rem 0; }
  .danger { color: var(--void-danger); }
  @media(max-width: 640px) { .month { grid-template-columns: 1fr; gap: 1.5rem; } .thought { grid-template-columns: 2.6rem 1fr .8rem; gap: .7rem; } .archive-controls { margin-top: 2.4rem; } }
</style>
