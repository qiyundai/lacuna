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
    <div class="auth-overlay">
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
    color: var(--void-text);
    font-family: var(--font-serif);
    font-size: var(--text-xl);
    letter-spacing: var(--ls-display);
    font-weight: 400;
    margin: 0 0 var(--space-7);
  }

  .auth-enter {
    background: transparent;
    border: none;
    color: var(--void-text-dim);
    font-family: var(--font-serif);
    font-size: var(--text-md);
    letter-spacing: var(--ls-display);
    cursor: pointer;
    padding: var(--space-2) var(--space-4);
    transition: color var(--dur-base) var(--ease-soft), letter-spacing var(--dur-base) var(--ease-soft);
    margin-bottom: var(--space-5);
  }

  .auth-enter:hover,
  .auth-enter:focus {
    color: var(--void-text);
    outline: none;
  }

  .auth-enter:disabled {
    color: var(--void-text-hint);
    cursor: default;
    letter-spacing: 0.35em;
  }

  .auth-privacy {
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-ui);
    text-align: center;
    max-width: 30ch;
    line-height: var(--lh-prose);
    margin: 0 0 var(--space-2);
  }

  .auth-links {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-5);
  }

  .auth-sep {
    color: var(--void-text-faint);
    font-size: var(--text-xs);
  }

  .what-is-this {
    background: transparent;
    border: none;
    color: var(--void-text-hint);
    font-family: var(--font-serif);
    font-size: var(--text-xs);
    letter-spacing: var(--ls-label);
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    transition: color var(--dur-base) var(--ease-soft);
  }

  .what-is-this:hover,
  .what-is-this:focus {
    color: var(--void-text);
    outline: none;
  }

  .auth-error {
    color: var(--void-danger);
    font-size: var(--text-sm);
    font-family: var(--font-serif);
    margin: 0 0 var(--space-3);
  }
</style>
