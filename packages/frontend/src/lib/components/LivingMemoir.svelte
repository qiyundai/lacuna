<script lang="ts">
  import { memoirStore } from '$lib/stores/memoir.svelte.js';
  import { entriesStore } from '$lib/stores/entries.svelte.js';

  function formatDate(unix: number): string {
    return new Date(unix * 1000).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  const entryCount = $derived(entriesStore.entries.length);
  const entriesNeeded = $derived(Math.max(0, 20 - entryCount));
</script>

<div class="memoir">
  {#if memoirStore.status === 'loading'}
    <div class="state-message">...</div>
  {:else if memoirStore.prose}
    <article class="prose">
      {#if memoirStore.generated_at}
        <time class="generated-at">{formatDate(memoirStore.generated_at)}</time>
      {/if}
      {#each memoirStore.prose.split('\n\n').filter(Boolean) as paragraph}
        <p>{paragraph}</p>
      {/each}
    </article>
  {:else}
    <div class="state-message">
      <p>your memoir takes shape over time</p>
      {#if entriesNeeded > 0}
        <p class="sub">{entriesNeeded} more {entriesNeeded === 1 ? 'entry' : 'entries'} before it begins</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .memoir {
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
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .sub {
    font-size: var(--text-xs);
    color: var(--void-text-faint);
  }

  .prose {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    animation: fadeIn 0.8s ease forwards;
  }

  .generated-at {
    color: var(--void-text-hint);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
    display: block;
    margin-bottom: var(--space-2);
  }

  p {
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    line-height: var(--lh-prose);
    letter-spacing: var(--ls-prose);
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
