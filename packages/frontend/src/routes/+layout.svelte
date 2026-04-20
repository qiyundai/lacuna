<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { session, hydrateSession, setAuthed } from '$lib/stores/session.svelte.js';
  import { initWeather } from '$lib/stores/weather.svelte.js';
  import { requestMagicLink, verifyMagicToken } from '$lib/auth.js';

  let { children } = $props();

  // The verify route must always render so it can exchange the token for a JWT,
  // even before the session is authed.
  let isAuthRoute = $derived(page.url.pathname.startsWith('/auth/'));

  let email = $state('');
  let linkSent = $state(false);
  let authError = $state('');
  let submitting = $state(false);

  onMount(() => {
    hydrateSession();
    initWeather();
  });

  async function submitEmail(e: SubmitEvent) {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    submitting = true;
    authError = '';
    try {
      await requestMagicLink(email.trim().toLowerCase());
      linkSent = true;
    } catch {
      authError = 'Something went wrong. Try again.';
    } finally {
      submitting = false;
    }
  }
</script>

{#if session.status === 'loading'}
  <!-- Silent loading — void background shows through -->
{:else if session.status === 'unauthed' && !isAuthRoute}
  <div class="auth-overlay">
    {#if linkSent}
      <p class="auth-message">check your email</p>
    {:else}
      <form onsubmit={submitEmail} class="auth-form">
        <input
          type="email"
          placeholder="your email"
          bind:value={email}
          autocomplete="email"
          autocapitalize="none"
          spellcheck={false}
          class="auth-input"
        />
        {#if authError}
          <p class="auth-error">{authError}</p>
        {/if}
      </form>
    {/if}
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .auth-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .auth-input {
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--void-text-dim);
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: 1.1rem;
    padding: 0.5rem 0;
    text-align: center;
    width: 240px;
    outline: none;
    letter-spacing: 0.03em;
  }

  .auth-input::placeholder {
    color: var(--void-text-faint);
  }

  .auth-message {
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 1rem;
    letter-spacing: 0.05em;
  }

  .auth-error {
    color: rgba(255, 120, 120, 0.7);
    font-size: 0.8rem;
    font-family: var(--font-serif);
  }
</style>
