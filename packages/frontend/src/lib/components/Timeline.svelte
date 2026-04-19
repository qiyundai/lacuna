<script lang="ts">
  import { entriesStore, loadMoreEntries } from '$lib/stores/entries.svelte.js';

  function formatDate(unix: number): string {
    return new Date(unix * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
</script>

<div class="timeline">
  {#if entriesStore.status === 'loading' && entriesStore.entries.length === 0}
    <div class="state-message">...</div>
  {:else if entriesStore.entries.length === 0}
    <div class="state-message">nothing yet</div>
  {:else}
    <ul class="entry-list">
      {#each entriesStore.entries as entry (entry.id)}
        <li class="entry">
          <time class="entry-date">{formatDate(entry.solidified_at ?? entry.created_at)}</time>
          <p class="entry-body">{entry.body}</p>
        </li>
      {/each}
    </ul>

    {#if entriesStore.nextCursor}
      <button class="load-more" onclick={loadMoreEntries}>
        {entriesStore.status === 'loading' ? '...' : 'earlier'}
      </button>
    {/if}
  {/if}
</div>

<style>
  .timeline {
    padding: 4rem 2rem 5rem;
    min-height: 100%;
  }

  .state-message {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.9rem;
    text-align: center;
    padding-top: 3rem;
    letter-spacing: 0.05em;
  }

  .entry-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .entry-date {
    color: var(--void-text-faint);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .entry-body {
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: 0.95rem;
    line-height: 1.65;
    letter-spacing: 0.02em;
  }

  .load-more {
    display: block;
    margin: 2rem auto 0;
    background: none;
    border: none;
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.85rem;
    letter-spacing: 0.05em;
    cursor: pointer;
    padding: 0.5rem;
  }
</style>
