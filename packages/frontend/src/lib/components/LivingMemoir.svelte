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
    padding: 4rem 2rem 5rem;
    min-height: 100%;
  }

  .state-message {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.9rem;
    text-align: center;
    padding-top: 3rem;
    letter-spacing: 0.04em;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sub {
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .prose {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    animation: fadeIn 0.8s ease forwards;
  }

  .generated-at {
    color: var(--void-text-faint);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: block;
    margin-bottom: 0.5rem;
  }

  p {
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: 0.95rem;
    line-height: 1.8;
    letter-spacing: 0.02em;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
