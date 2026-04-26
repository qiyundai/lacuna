<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { verifyMagicToken } from '$lib/auth.js';
  import { setAuthed } from '$lib/stores/session.svelte.js';

  let status = $state<'verifying' | 'error'>('verifying');
  let errorMsg = $state('');

  onMount(async () => {
    const token = page.url.searchParams.get('token');
    if (!token) {
      status = 'error';
      errorMsg = 'No token found.';
      return;
    }
    try {
      const user = await verifyMagicToken(token);
      setAuthed(user);
      await goto('/');
    } catch (err: unknown) {
      status = 'error';
      errorMsg =
        err instanceof Error && err.message ? err.message : 'Link expired or invalid.';
    }
  });
</script>

<div class="verify-container">
  {#if status === 'verifying'}
    <p class="verify-message">entering</p>
  {:else}
    <p class="verify-error">{errorMsg}</p>
    <a href="/" class="verify-back">return</a>
  {/if}
</div>

<style>
  .verify-container {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: var(--bg);
  }

  .verify-message {
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 1rem;
    letter-spacing: 0.1em;
    animation: pulse 2s ease-in-out infinite;
  }

  .verify-error {
    color: rgba(220, 110, 100, 0.75);
    font-family: var(--font-serif);
    font-size: 0.9rem;
  }

  .verify-back {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.85rem;
    text-decoration: none;
    letter-spacing: 0.05em;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
</style>
