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
  import { resetJournalData } from '$lib/stores/session.svelte.js';

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
  async function forgetThought() {
    if (!selected || busy) return;
    const id = selected.id, version = sessionVersion.value;
    busy = true; detailError = '';
    try {
      await api.entries.forget(id);
      if (version !== sessionVersion.value) return;
      resetJournalData();requestId++;
      results = results.filter(e => e.id !== id);
      selected = null;
      if(filtered)void searchEntries(query.trim(),kept,requestId);
      void loadEntries();void loadStory(); void loadPatterns(); void loadMemoir();
    } catch { detailError = 'Could not forget this page. Try again.'; }
    finally { busy = false; }
  }
</script>

<section class="timeline story-page" aria-label="Your thoughts">
  <header class="story-heading">
    <h1>Your journal</h1>
    {#if storyStore.data?.summary.total}
      <p class="quiet">{storyStore.data.summary.total} {storyStore.data.summary.total === 1 ? 'thought' : 'thoughts'} gathered{#if storyStore.data.summary.first_at}{' since '}{dateLabel(storyStore.data.summary.first_at, { month: 'long', year: 'numeric' })}{/if}.</p>
    {/if}
  </header>
  <div class="archive-controls">
    <div class="quiet-toggles" role="group" aria-label="Filter thoughts">
      <button class="quiet-toggle" aria-pressed={!kept} onclick={() => kept = false}>everything</button>
      <button class="quiet-toggle" aria-pressed={kept} onclick={() => kept = true}>kept close{#if storyStore.data?.summary.kept}<span class="count">{storyStore.data.summary.kept}</span>{/if}</button>
    </div>
    <button class="quiet-toggle" aria-expanded={searching} onclick={() => { searching = !searching; if (!searching) query = ''; }}>find a word</button>
  </div>
  {#if searching}
    <div class="search-line" transition:fade={{ duration: 250 }}>
      <input type="search" aria-label="Search all your thoughts" placeholder="a person, a place, a feeling…" bind:value={query} maxlength="200" />
      {#if query}<button class="quiet-toggle" onclick={() => query = ''}>clear</button>{/if}
    </div>
  {/if}
  {#if error}<p class="quiet" role="alert">{error} <button class="quiet-toggle" onclick={() => searchEntries(query.trim(), kept, requestId)}>try again</button></p>{/if}
  {#if loading || (entriesStore.status === 'loading' && !entries.length)}<p class="quiet waiting" role="status">gathering your words…</p>
  {:else if !entries.length}
    <div class="empty-story">
      <span class="seed" aria-hidden="true">✧</span>
      <p>{filtered ? 'No thoughts here yet.' : 'Your journal is ready.'}</p>
      <p class="quiet">{query ? 'Try another word, or clear your search.' : kept ? 'Open a thought and choose “keep close” to find it here.' : 'Write a thought in town to meet its resident. Your original words will appear here.'}</p>
      {#if entriesStore.status === 'error'}<button class="quiet-toggle" onclick={loadEntries}>try loading again</button>{/if}
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
    {#if filtered ? nextCursor : entriesStore.nextCursor}<button class="quiet-toggle earlier" disabled={loading || entriesStore.status === 'loading'} onclick={earlier}>a little earlier</button>{/if}
    {#if !filtered && entriesStore.status === 'error'}<p class="quiet">Could not load earlier thoughts. <button class="quiet-toggle" onclick={earlier}>try again</button></p>{/if}
  {/if}
</section>

{#if selected}
  <div class="thought-screen" use:modal={{ dismiss: close }} role="dialog" aria-modal="true" aria-label="A thought you held" tabindex="-1" onclick={e => { if (e.target === e.currentTarget) close(); }} onkeydown={e => { if (e.key === 'Escape') close(); }} transition:fade={{ duration: 400, easing: cubicOut }}>
    <article class="thought-reader">
      <time class="whisper">{dateLabel(selected.created_at)}</time>
      <p class="held-words">{selected.body}</p>
      <div class="thought-actions">
        <button class="quiet-toggle kept" disabled={busy} aria-pressed={!!selected.kept_at} onclick={keepThought}>{selected.kept_at ? '✧ kept close' : '✧ keep close'}</button>
        <button class="quiet-toggle" disabled={busy} aria-expanded={confirming} onclick={() => confirming = !confirming}>forget this page</button>
      </div>
      {#if confirming}
        <div class="release" transition:fade={{ duration: 250 }}>
          <p>This removes the words and related readings from your active journal. The address stays. Earlier backups and exports may still contain the page.</p>
          <div class="release-actions"><button class="quiet-toggle" disabled={busy} onclick={() => confirming = false}>keep this page</button>
          <button class="quiet-toggle danger" disabled={busy} onclick={forgetThought}>forget page</button></div>
        </div>
      {/if}
      {#if detailError}<p role="alert" class="quiet">{detailError}</p>{/if}
      <button class="quiet-toggle back" disabled={busy} onclick={close}>return to your words</button>
    </article>
  </div>
{/if}

<style>
  /* The month and date columns need room beside a full reading line */
  .timeline { max-width: 62rem; }
  .archive-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-5); padding-bottom: var(--space-2); border-bottom: 1px solid var(--rule); }
  .search-line { display: flex; align-items: center; gap: var(--space-4); margin-top: var(--space-4); }
  input { width: 100%; min-height: 48px; padding: var(--space-2) 0; border: 0; border-bottom: 1px solid var(--line-strong); border-radius: 0; background: none; color: var(--ink); font: 400 var(--text-lg)/1.4 var(--font); }
  input:focus-visible { outline: 0; border-bottom-color: var(--ink); }
  input::placeholder { color: var(--ink-subtle); font-style: italic; }
  /* Month on the left, thoughts on the right; every line shares the entry's first baseline */
  .month { display: grid; grid-template-columns: 8rem minmax(0, 1fr); column-gap: var(--space-6); align-items: baseline; margin-top: var(--space-8); }
  .month:first-of-type { margin-top: var(--space-7); }
  h2 { font: 400 var(--ui-sm)/var(--lh-ui) var(--font); letter-spacing: var(--ls-ui); color: var(--ink-subtle); }
  .thoughts { display: flex; flex-direction: column; gap: var(--space-6); }
  .thought { display: grid; grid-template-columns: 3.75rem minmax(0, 1fr) 1.25rem; column-gap: var(--space-4); align-items: baseline; width: 100%; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .thought time { font: 400 var(--ui-xs)/var(--lh-ui) var(--font); letter-spacing: var(--ls-ui); color: var(--ink-subtle); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .words { font: 400 var(--text-lg)/var(--lh-prose) var(--font); letter-spacing: var(--ls-prose); color: var(--ink-muted); white-space: pre-wrap; overflow-wrap: anywhere; transition: color var(--dur-fast) var(--ease-soft); }
  .thought:hover .words { color: var(--ink); }
  .kept-mark { justify-self: end; color: var(--moss); font-size: var(--ui-md); }
  .earlier { display: flex; margin: var(--space-8) auto 0; }
  .waiting { padding: var(--space-7) 0; }
  .thought-screen { position: fixed; inset: 0; z-index: 220; overflow-y: auto; display: flex; align-items: safe center; justify-content: center; padding: var(--space-9) var(--gutter); background: color-mix(in srgb, var(--paper) 95%, transparent); -webkit-backdrop-filter: blur(22px); backdrop-filter: blur(22px); }
  .thought-reader { width: min(100%, 36rem); display: grid; justify-items: center; text-align: center; }
  .held-words { margin: var(--space-5) 0 var(--space-7); font: 400 var(--text-xl)/1.65 var(--font); letter-spacing: var(--ls-prose); white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; }
  .thought-actions, .release-actions { display: flex; flex-wrap: wrap; justify-content: center; column-gap: var(--space-6); }
  .kept[aria-pressed=true] { color: var(--moss); }
  .back { margin-top: var(--space-6); }
  .release { max-width: 32rem; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--rule); font: 400 var(--ui-md)/var(--lh-prose) var(--font); color: var(--ink-subtle); }
  .release-actions { margin-top: var(--space-2); }
  .danger, .danger:enabled:hover { color: var(--danger); }
  @media (max-width: 640px) {
    .month { grid-template-columns: minmax(0, 1fr); row-gap: var(--space-4); margin-top: var(--space-7); }
    .thought { grid-template-columns: 3.25rem minmax(0, 1fr) 1rem; column-gap: var(--space-3); }
  }
</style>
