<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { aiAvailable } from '../../../shared/ai-release.js';
  import { backgroundBook } from '$lib/reflection-service.js';
  import { watchBrowserSync } from '$lib/browser-sync.js';
  import { session, hydrateSession, setAuthed, signOut, resetJournalData } from '$lib/stores/session.svelte.js';
  import { initWeather } from '$lib/stores/weather.svelte.js';
  import { page } from '$app/state';
  import { isCompanion } from '$lib/api.js';
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { readLocal, writeLocal } from '$lib/storage.js';
  import TownWelcome from '$lib/components/TownWelcome.svelte';
  import PrivacyOverlay from '$lib/components/PrivacyOverlay.svelte';
  import VaultGate from '$lib/components/VaultGate.svelte';
  import ValleyLoading from '$lib/components/ValleyLoading.svelte';
  import AlbumPlayer from '$lib/components/AlbumPlayer.svelte';
  import { vaultStore, loadVault, didLock } from '$lib/stores/vault.svelte.js';

  let { children } = $props();

  let authError = $state('');
  let submitting = $state(false);


  let consentGiven = $state(false);
  let showConsentOverlay = $state(false);

  function handleConsent() {
    writeLocal('lacuna_consented', '1');
    consentGiven = true;
  }

  onMount(() => {
    document.getElementById('initial-arrival')?.remove();
    hydrateSession();
    const stopSync=isCompanion?undefined:watchBrowserSync();
    window.addEventListener('lacuna:sync-applied',resetJournalData);
    const stopBook=aiAvailable && !isCompanion?backgroundBook():undefined;
    initWeather();
    const stored = readLocal('lacuna_consented');
    consentGiven = !!stored;
    const notice = readLocal('lacuna_revocation_notice');
    if (notice) authError = notice;

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
      stopBook?.();
      stopSync?.();
      window.removeEventListener('lacuna:sync-applied',resetJournalData);
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

<AlbumPlayer/>
{#if page.url.pathname === '/privacy' || page.route.id === '/studio/tide-house' || page.route.id === '/studio/ferry-hall' || page.route.id === '/studio/waterfront'}
  {@render children()}
{:else if isCompanion && session.status === 'unauthed'}
  <TownWelcome action="Open companion">
    <div class="atlas-form">
      <h1 tabindex="-1">Connect your journal</h1>
      <p>Sign in with ChatGPT to open your desktop companion. Your journal has its own passphrase.</p>
      {#if consentGiven}
        <button class="atlas-primary" disabled={submitting} onclick={connect}>{submitting ? 'Connecting…' : 'Continue with ChatGPT'}</button>
      {:else}
        <button class="atlas-primary" onclick={()=>showConsentOverlay=true}>Review data and privacy</button>
      {/if}
      {#if authError}<p role="alert" class="form-error">{authError}</p>{/if}
    </div>
  </TownWelcome>
  <PrivacyOverlay bind:show={showConsentOverlay} consentMode={true} onConsent={handleConsent}/>
{:else if (isCompanion && session.status === 'loading') || !vaultStore.status}
  {#if authError}
    <div class="vault-loading" role="alert">{authError}<button class="atlas-link" onclick={()=>{authError='';loadVault().catch(e=>authError=e.message);}}>Try again</button></div>
  {:else}
    <ValleyLoading label="Opening your journal…"/>
  {/if}
{:else if vaultStore.status.locked}
  <VaultGate />
{:else}
  {@render children()}
{/if}
<style>
  .vault-loading{display:grid;place-content:center;gap:1rem;height:100%;background:var(--valley);color:var(--ink);font:1.5rem var(--font-reading)}
</style>
