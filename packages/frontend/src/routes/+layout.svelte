<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { session, hydrateSession, setAuthed } from '$lib/stores/session.svelte.js';
  import { initWeather } from '$lib/stores/weather.svelte.js';
  import { requestMagicLink, verifyMagicToken } from '$lib/auth.js';
  import InfoOverlay from '$lib/components/InfoOverlay.svelte';

  let { children } = $props();

  // The verify route must always render so it can exchange the token for a JWT,
  // even before the session is authed.
  let isAuthRoute = $derived(page.url.pathname.startsWith('/auth/'));

  let email = $state('');
  let linkSent = $state(false);
  let authError = $state('');
  let submitting = $state(false);
  let showInfo = $state(false);

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
    <p class="app-name">lacuna</p>
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
        <button type="submit" class="auth-submit" disabled={submitting}>enter</button>
        {#if authError}
          <p class="auth-error">{authError}</p>
        {/if}
        <p class="auth-privacy">entries are privately analyzed by ai to surface patterns in your story</p>
      </form>
    {/if}
    <button class="what-is-this" onclick={() => (showInfo = true)}>what is this</button>
  </div>
  <InfoOverlay bind:show={showInfo} />
{:else}
  {@render children()}
{/if}

<style>
  .auth-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg);
  }

  .app-name {
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 1.6rem;
    letter-spacing: 0.18em;
    font-weight: 400;
    margin: 0 0 2.5rem;
    opacity: 0.7;
  }

  .what-is-this {
    background: transparent;
    border: none;
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    cursor: pointer;
    padding: 0.4rem 0;
    margin-top: 1.5rem;
    opacity: 0.6;
    transition: opacity 0.3s ease, color 0.3s ease;
  }

  .what-is-this:hover,
  .what-is-this:focus {
    opacity: 1;
    color: var(--void-text-dim);
    outline: none;
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
    color: var(--void-text-hint);
  }

  .auth-message {
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 1rem;
    letter-spacing: 0.05em;
  }

  .auth-submit {
    background: transparent;
    border: none;
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    cursor: pointer;
    padding: 0.4rem 0;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .auth-submit:hover {
    opacity: 1;
  }

  .auth-submit:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .auth-error {
    color: rgba(220, 110, 100, 0.75);
    font-size: 0.8rem;
    font-family: var(--font-serif);
  }

  .auth-privacy {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-align: center;
    max-width: 26ch;
    line-height: 1.5;
    margin: 0;
    opacity: 0.5;
  }
</style>
