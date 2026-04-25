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
    <div class="state-message">
      <span>nothing here yet.</span>
      <span class="state-sub">type in the void above to begin.</span>
    </div>
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
    padding: var(--space-8) var(--space-6) var(--space-9);
    min-height: 100%;
  }

  .state-message {
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-sm);
    text-align: center;
    padding-top: var(--space-7);
    letter-spacing: var(--ls-ui);
    line-height: var(--lh-prose);
  }

  .entry-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-7);
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .entry-date {
    color: var(--void-text-hint);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
  }

  .entry-body {
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    line-height: var(--lh-prose);
    letter-spacing: var(--ls-prose);
  }

  .state-sub {
    display: block;
    margin-top: var(--space-2);
    font-size: var(--text-xs);
    color: var(--void-text-faint);
  }

  .load-more {
    display: block;
    margin: var(--space-7) auto 0;
    background: none;
    border: none;
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
    cursor: pointer;
    padding: var(--space-2) var(--space-4);
    transition: color var(--dur-base) var(--ease-soft);
  }

  .load-more:hover,
  .load-more:focus {
    color: var(--void-text-dim);
    outline: none;
  }
</style>
