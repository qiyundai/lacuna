<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { session, hydrateSession, setAuthed, signOut } from '$lib/stores/session.svelte.js';
  import { initWeather } from '$lib/stores/weather.svelte.js';
  import { page } from '$app/state';
  import { isCompanion } from '$lib/api.js';
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { readLocal, writeLocal } from '$lib/storage.js';
  import InfoOverlay from '$lib/components/InfoOverlay.svelte';
  import PrivacyOverlay from '$lib/components/PrivacyOverlay.svelte';
  import VaultGate from '$lib/components/VaultGate.svelte';
  import { vaultStore, loadVault, didLock } from '$lib/stores/vault.svelte.js';

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
    const notice = readLocal('lacuna_revocation_notice');
    if (notice) authError = notice;
    if (!stored && isCompanion) showConsentOverlay = true;
    if (!isCompanion) {
      setAuthed({ id: 'this-browser', email: 'on this device' });
      loadVault().catch(err => { authError = err instanceof Error ? err.message : 'Could not open browser storage.'; });
    }
    if (isCompanion) {
      companionRequest<{ session: { user: { id: string; email: string } } | null; error: string | null }>('session').then(async result => {
        if (result.session) {
          setAuthed(result.session.user);
          vaultStore.status = null;
          await loadVault();
        }
        if (result.error) authError = result.error;
      }).catch(err => { authError = err instanceof Error ? err.message : 'Reopen the companion to sign in.'; });
    }
    window.addEventListener('lacuna:unauthorized', signOut);
    window.addEventListener('lacuna:locked', didLock);
    let lastActivity = 0;
    const activity = () => {
      if (session.status !== 'authed' || vaultStore.status?.locked || Date.now() - lastActivity < 15000) return;
      lastActivity = Date.now(); companionRequest('vault/activity', 'POST').catch(() => {});
    };
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchmove'];
    for (const event of activityEvents) window.addEventListener(event, activity, { passive: true });
    const timer = setInterval(() => { if (session.status === 'authed') loadVault().catch(() => {}); }, 5000);
    return () => {
      clearInterval(timer); window.removeEventListener('lacuna:unauthorized', signOut); window.removeEventListener('lacuna:locked', didLock);
      for (const event of activityEvents) window.removeEventListener(event, activity);
    };
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

{#if page.url.pathname === '/privacy'}
  {@render children()}
{:else if !isCompanion}
  {#if !vaultStore.status}
    <div class="vault-loading" role="status"><p>{authError || 'opening your private space…'}</p>{#if authError}<button onclick={() => { authError = ''; loadVault().catch(e => authError = e.message); }}>try again</button>{/if}</div>
  {:else if vaultStore.status.locked}
    <VaultGate />
  {:else}
    {@render children()}
  {/if}
{:else if session.status === 'loading'}
  <!-- Silent loading — void background shows through -->
{:else if session.status === 'unauthed'}
  <div class="auth-overlay" class:blurred={showInfo || showPrivacy}>
    <div class="auth-glow auth-glow-a" aria-hidden="true"></div>
    <div class="auth-glow auth-glow-b" aria-hidden="true"></div>
    {#if consentGiven}
      <div class="auth-content">
        <p class="app-name">lacuna</p>
          <button class="auth-submit" disabled={submitting} onclick={connect}>{submitting ? 'connecting…' : 'Continue with ChatGPT'}</button>
          <p class="auth-message">your account and reflections, through ChatGPT</p>
        {#if authError}<p class="auth-error" role="alert">{authError}</p>{/if}
        <div class="auth-links">
          <button class="what-is-this" onclick={() => (showInfo = true)}>what is this</button>
          <span class="auth-sep" aria-hidden="true">·</span>
          <button class="what-is-this" onclick={() => (showPrivacy = true)}>data & privacy</button>
          <a class="what-is-this" href="/privacy">privacy declaration</a>
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
{:else if !vaultStore.status}
  <p class="vault-loading" role="status">opening your private space… {authError}</p>
{:else if vaultStore.status.locked}
  <VaultGate />
{:else}
  {@render children()}
{/if}

<style>
  .vault-loading { padding: 3rem; text-align: center; color: var(--void-text-dim); }
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
