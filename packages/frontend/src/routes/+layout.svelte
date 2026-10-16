<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { session, hydrateSession, setAuthed, signOut } from '$lib/stores/session.svelte.js';
  import { initWeather } from '$lib/stores/weather.svelte.js';
  import { storeSession } from '$lib/auth.js';
  import { isCompanion } from '$lib/api.js';
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { readLocal, writeLocal } from '$lib/storage.js';
  import InfoOverlay from '$lib/components/InfoOverlay.svelte';
  import PrivacyOverlay from '$lib/components/PrivacyOverlay.svelte';

  let { children } = $props();

  let authError = $state('');
  let submitting = $state(false);
  let showInfo = $state(false);
  let showPrivacy = $state(false);

  let consentGiven = $state(false);
  let showConsentOverlay = $state(false);

  function handleConsent() {
    writeLocal('lacuna_consented', '1');
    consentGiven = true;
  }

  onMount(() => {
    hydrateSession();
    initWeather();
    const stored = readLocal('lacuna_consented');
    consentGiven = !!stored;
    if (!stored) showConsentOverlay = true;
    if (isCompanion) {
      companionRequest<{ session: { jwt: string; user: { id: string; email: string } } | null; error: string | null }>('session').then(result => {
        if (result.session) {
          storeSession(result.session.jwt, result.session.user);
          setAuthed(result.session.user);
        }
        if (result.error) authError = result.error;
      }).catch(err => { authError = err instanceof Error ? err.message : 'Reopen the companion to sign in.'; });
    }
    window.addEventListener('lacuna:unauthorized', signOut);
    return () => window.removeEventListener('lacuna:unauthorized', signOut);
  });

  async function connect() {
    if (submitting || !consentGiven) return;
    submitting = true;
    authError = '';
    try {
      const { url } = await companionRequest<{ url: string }>('connect', 'POST', { consent: true });
      location.assign(url);
    } catch (err) {
      authError = err instanceof Error ? err.message : 'Something went wrong. Try again.';
    } finally {
      submitting = false;
    }
  }
</script>

{#if session.status === 'loading'}
  <!-- Silent loading — void background shows through -->
{:else if session.status === 'unauthed'}
  <div class="auth-overlay" class:blurred={showInfo || showPrivacy}>
    <div class="auth-glow auth-glow-a" aria-hidden="true"></div>
    <div class="auth-glow auth-glow-b" aria-hidden="true"></div>
    {#if consentGiven}
      <div class="auth-content">
        <p class="app-name">lacuna</p>
        {#if isCompanion}
          <button class="auth-submit" disabled={submitting} onclick={connect}>{submitting ? 'connecting…' : 'Continue with ChatGPT'}</button>
          <p class="auth-message">your account and reflections, through ChatGPT</p>
        {:else}
          <a class="auth-submit" href="http://127.0.0.1:1455">Continue with ChatGPT</a>
          <p class="auth-message">start the companion on this computer, then continue</p>
          <a class="what-is-this" href="https://github.com/qiyundai/lacuna#chatgpt-plan-companion" target="_blank" rel="noreferrer">set up the companion</a>
        {/if}
        {#if authError}<p class="auth-error" role="alert">{authError}</p>{/if}
        <div class="auth-links">
          <button class="what-is-this" onclick={() => (showInfo = true)}>what is this</button>
          <span class="auth-sep" aria-hidden="true">·</span>
          <button class="what-is-this" onclick={() => (showPrivacy = true)}>data & privacy</button>
        </div>
      </div>
    {/if}
  </div>
  <PrivacyOverlay
    bind:show={showConsentOverlay}
    consentMode={true}
    onConsent={handleConsent}
  />
  <PrivacyOverlay bind:show={showPrivacy} />
  <InfoOverlay bind:show={showInfo} />
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
    overflow: hidden;
    transition: filter 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  .auth-overlay.blurred {
    filter: blur(8px);
  }

  .auth-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .auth-glow {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
  }

  .auth-glow-a {
    width: 55vmin;
    height: 55vmin;
    top: 25%;
    left: 32%;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, rgba(255, 200, 140, 0.22) 0%, transparent 65%);
    animation: auth-breathe 9s ease-in-out infinite;
  }

  .auth-glow-b {
    width: 44vmin;
    height: 44vmin;
    top: 72%;
    left: 66%;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, rgba(180, 160, 240, 0.15) 0%, transparent 65%);
    animation: auth-breathe 12s ease-in-out infinite reverse;
  }

  @keyframes auth-breathe {
    0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
    50%       { opacity: 1;   transform: translate(-50%, -50%) scale(1.14); }
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

  .auth-links {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 1.5rem;
  }

  .auth-sep {
    color: var(--void-text-faint);
    opacity: 0.3;
    font-size: 0.72rem;
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
    opacity: 0.6;
    transition: opacity 0.3s ease, color 0.3s ease;
  }

  .what-is-this:hover,
  .what-is-this:focus {
    opacity: 1;
    color: var(--void-text-dim);
    outline: none;
  }

  .auth-message {
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 1rem;
    letter-spacing: 0.05em;
  }

  .auth-submit {
    text-decoration: none;
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

</style>
