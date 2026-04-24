<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { session, hydrateSession, setAuthed } from '$lib/stores/session.svelte.js';
  import { initWeather } from '$lib/stores/weather.svelte.js';
  import { authenticatePasskey, registerPasskey } from '$lib/auth.js';
  import InfoOverlay from '$lib/components/InfoOverlay.svelte';
  import RecoveryCodeSave from '$lib/components/RecoveryCodeSave.svelte';
  import RecoveryOverlay from '$lib/components/RecoveryOverlay.svelte';

  let { children } = $props();

  let isAuthRoute = $derived(page.url.pathname.startsWith('/auth/'));

  let entering = $state(false);
  let authError = $state('');
  let showInfo = $state(false);
  let showRecovery = $state(false);

  // Pending state: don't set authed until user acknowledges the recovery code
  let pendingUser = $state<{ id: string } | null>(null);
  let pendingRecoveryCode = $state('');

  onMount(() => {
    hydrateSession();
    initWeather();
  });

  async function enter() {
    if (entering) return;
    entering = true;
    authError = '';
    try {
      setAuthed(await authenticatePasskey());
    } catch (e: unknown) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError') { entering = false; return; }
      try {
        const result = await registerPasskey();
        // Hold the session until user saves their recovery code
        pendingUser = { id: result.id };
        pendingRecoveryCode = result.recoveryCode;
        entering = false;
      } catch (r: unknown) {
        if ((r instanceof Error ? r.name : '') !== 'NotAllowedError') {
          authError = 'passkey unavailable';
        }
        entering = false;
      }
    }
  }

  function acknowledgeRecoveryCode() {
    if (!pendingUser) return;
    setAuthed(pendingUser);
    pendingUser = null;
    pendingRecoveryCode = '';
  }

  function handleRecoverySuccess(user: { id: string }, newRecoveryCode?: string) {
    if (newRecoveryCode) {
      // Recovery code was used — overlay shows the new code, then closes via onClose
      // Session is already set in verifyRecoveryCode, just close the recovery overlay on done
    } else {
      showRecovery = false;
      setAuthed(user);
    }
  }
</script>

{#if session.status === 'loading'}
  <!-- Silent loading — void background shows through -->
{:else if session.status === 'unauthed' && !isAuthRoute}
  {#if pendingRecoveryCode}
    <RecoveryCodeSave code={pendingRecoveryCode} onAcknowledge={acknowledgeRecoveryCode} />
  {:else}
    <div class="auth-overlay" class:blurred={showInfo || showRecovery}>
      <div class="auth-glow auth-glow-a" aria-hidden="true"></div>
      <div class="auth-glow auth-glow-b" aria-hidden="true"></div>
      <div class="auth-content">
        <p class="app-name">lacuna</p>
        <button class="auth-enter" onclick={enter} disabled={entering}>
          {entering ? '·····' : 'enter'}
        </button>
        {#if authError}
          <p class="auth-error">{authError}</p>
        {/if}
        <p class="auth-privacy">entries are privately analyzed by ai to surface patterns in your story</p>
        <div class="auth-links">
          <button class="what-is-this" onclick={() => (showInfo = true)}>what is this</button>
          <span class="auth-sep" aria-hidden="true">·</span>
          <button class="what-is-this" onclick={() => (showRecovery = true)}>can't enter?</button>
        </div>
      </div>
    </div>
    <InfoOverlay bind:show={showInfo} />
    {#if showRecovery}
      <RecoveryOverlay
        onSuccess={handleRecoverySuccess}
        onClose={() => (showRecovery = false)}
      />
    {/if}
  {/if}
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

  .auth-enter {
    background: transparent;
    border: none;
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: 1.1rem;
    letter-spacing: 0.18em;
    cursor: pointer;
    padding: 0.5rem 0;
    opacity: 0.55;
    transition: opacity 0.3s ease;
    margin-bottom: 1.5rem;
  }

  .auth-enter:hover,
  .auth-enter:focus {
    opacity: 1;
    outline: none;
  }

  .auth-enter:disabled {
    opacity: 0.25;
    cursor: default;
    letter-spacing: 0.35em;
  }

  .auth-privacy {
    color: var(--void-text-faint);
    font-family: var(--font-serif);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-align: center;
    max-width: 26ch;
    line-height: 1.5;
    margin: 0 0 0.5rem;
    opacity: 0.5;
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

  .auth-error {
    color: rgba(220, 110, 100, 0.75);
    font-size: 0.8rem;
    font-family: var(--font-serif);
    margin: 0 0 0.75rem;
  }
</style>
