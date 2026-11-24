<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { aiAvailable } from '$lib/ai-release.js';
  import { backgroundBook } from '$lib/reflection-service.js';
  import { watchBrowserSync } from '$lib/browser-sync.js';
  import { requestDurableStorage } from '$lib/storage.js';
  import { session, hydrateSession, setAuthed, resetJournalData } from '$lib/stores/session.svelte.js';
  import { initWeather } from '$lib/stores/weather.svelte.js';
  import { page } from '$app/state';
  import VaultGate from '$lib/components/VaultGate.svelte';
  import ValleyLoading from '$lib/components/ValleyLoading.svelte';
  import AlbumPlayer from '$lib/components/AlbumPlayer.svelte';
  import { vaultStore, vaultRequest, loadVault, didLock } from '$lib/stores/vault.svelte.js';

  let { children } = $props();

  let loadError = $state('');

  onMount(() => {
    document.getElementById('initial-arrival')?.remove();
    hydrateSession();
    const stopSync = watchBrowserSync();
    window.addEventListener('lacuna:sync-applied', resetJournalData);
    const stopBook = aiAvailable ? backgroundBook() : undefined;
    initWeather();
    setAuthed({ id: 'this-browser', email: 'on this device' });
    loadVault().catch(err => { loadError = err instanceof Error ? err.message : 'Could not open browser storage.'; });
    const permissionChanged = () => { void loadVault().catch(() => {}); };
    window.addEventListener('lacuna:journal-changed', permissionChanged);
    const keepJournal = (event: Event) => { if ((event as CustomEvent<{ saved?: boolean }>).detail?.saved) void requestDurableStorage(); };
    window.addEventListener('lacuna:journal-changed', keepJournal);
    window.addEventListener('lacuna:locked', didLock);
    let lastActivity = 0;
    const activity = () => {
      if (session.status !== 'authed' || vaultStore.status?.locked || Date.now() - lastActivity < 15000) return;
      lastActivity = Date.now(); vaultRequest('vault/activity', 'POST').catch(() => {});
    };
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchmove'];
    for (const event of activityEvents) window.addEventListener(event, activity, { passive: true });
    const timer = setInterval(() => { if (session.status === 'authed') loadVault().catch(() => {}); }, 5000);
    return () => {
      stopBook?.();
      stopSync();
      window.removeEventListener('lacuna:journal-changed', permissionChanged);
      window.removeEventListener('lacuna:journal-changed', keepJournal);
      window.removeEventListener('lacuna:sync-applied', resetJournalData);
      clearInterval(timer); window.removeEventListener('lacuna:locked', didLock);
      for (const event of activityEvents) window.removeEventListener(event, activity);
    };
  });
</script>

<AlbumPlayer/>
{#if page.route.id === '/billing' || page.url.pathname === '/privacy' || page.route.id === '/studio/tide-house' || page.route.id === '/studio/ferry-hall' || page.route.id === '/studio/waterfront'}
  {@render children()}
{:else if !vaultStore.status}
  {#if loadError}
    <div class="vault-loading" role="alert">{loadError}<button class="atlas-link" onclick={()=>{loadError='';loadVault().catch(e=>loadError=e.message);}}>Try again</button></div>
  {:else}
    <ValleyLoading label="Opening your journal…"/>
  {/if}
{:else if vaultStore.status.locked}
  <VaultGate />
{:else}
  {@render children()}
{/if}
<style>
  .vault-loading{display:grid;place-content:center;justify-items:center;gap:var(--space-4);height:100%;padding:var(--gutter);background:var(--valley);color:var(--ink);font:400 var(--text-lg)/var(--lh-ui) var(--font);text-align:center}
</style>
