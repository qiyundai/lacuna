<script lang="ts">
  import { aiAvailable } from '../../../../shared/ai-release.js';
  import { onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { isCompanion } from '$lib/api.js';
  import { aiStore, loadAI, companionRequest } from '$lib/stores/ai.svelte.js';
  import { modal } from '$lib/modal.js';
  import ReflectionAccount from './ReflectionAccount.svelte';
  import { loadPatterns } from '$lib/stores/patterns.svelte.js';
  import { loadMemoir } from '$lib/stores/memoir.svelte.js';
  let { show = $bindable(false) }: { show: boolean } = $props();
  let error = $state(''), busy = $state(false);
  let testResult = $state('');
  let models = $state<{ slug: string; name: string }[]>([]);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    busy = true; error = '';
    try { await action(); await loadAI(); } catch (err) { error = err instanceof Error ? err.message : 'Try again.'; } finally { busy = false; }
  }
  async function connect() {
    const { url } = await companionRequest<{ url: string }>('connect', 'POST', { consent: true });
    location.assign(url);
  }
  async function disconnect() {
    const { revoked } = await companionRequest<{ revoked: boolean }>('disconnect', 'POST');
    if (!revoked) error = 'Disconnected here. Remote revocation was not confirmed; disconnect Lacuna in ChatGPT settings.';
  }
  $effect(() => {
    if (!show || !aiAvailable) return;
    untrack(() => run(async () => {
      await loadAI();
      if (isCompanion && aiStore.companion?.connected) models = await companionRequest('models');
    }));
  });
  onMount(() => {
    if(!aiAvailable)return;
    const timer = setInterval(() => { if (show) loadAI().then(() => { if (aiStore.companion?.state === 'complete') { loadPatterns(); loadMemoir(); } }).catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  });
</script>
{#if show}
  <div class="sheet-screen" style:z-index="210" use:modal={{ dismiss: () => show = false }} role="dialog" aria-modal="true" aria-label="AI reflections" tabindex="-1"
    onclick={(event) => { if (event.target === event.currentTarget) show = false; }} onkeydown={(event) => { if (event.key === 'Escape') show = false; }} transition:fade={{ duration: 400, easing: cubicOut }}>
    <div class="journal-sheet">
      <h2>AI reflections</h2>
      {#if !aiAvailable}
        <p class="note soon">Coming soon</p>
        <p>The Soul Map will trace recurring threads in your pages. The Living Memoir will gather them into chapters.</p>
      {:else if isCompanion}
        <p>using your ChatGPT plan. eligible requests use your plan allowance or credits. enable journal sharing in privacy & storage before refreshing reflections.</p>
        {#if aiStore.companion?.connected}
          <p>{aiStore.companion.email}</p>
          {#if !aiStore.companion.planEnabled}<p>you’re signed in. reconnect and allow ChatGPT plan use to generate reflections.</p>{/if}
          <button class="atlas-link" disabled={busy || aiStore.companion.state === 'running'} onclick={() => run(connect)}>Reconnect ChatGPT</button>
          <p class="note">Choose a model</p>
          <div class="models">
            {#each models as model}
              <button class="quiet-toggle" class:selected={(aiStore.companion.model ?? models[0]?.slug) === model.slug} disabled={busy} aria-pressed={(aiStore.companion.model ?? models[0]?.slug) === model.slug}
                onclick={() => run(() => companionRequest('model', 'PATCH', { model: model.slug }))}>{model.name}</button>
            {/each}
          </div>
          <button class="atlas-link" disabled={busy || aiStore.companion.state === 'running'} onclick={() => run(() => companionRequest('reflect', 'POST'))}>{aiStore.companion.state === 'running' ? 'reflecting…' : 'refresh reflections'}</button>
          <button class="atlas-link" disabled={busy} onclick={() => run(async () => { testResult = ''; const result = await companionRequest<{ text: string }>('test', 'POST'); testResult = result.text; })}>Test ChatGPT connection</button>
          {#if testResult}<p role="status">{testResult}</p>{/if}
          <button class="atlas-link" disabled={busy} onclick={() => run(disconnect)}>Disconnect ChatGPT</button>
        {:else}
          <p>use your ChatGPT plan for reflections. your journal is saved in your encrypted local vault; access and refresh tokens stay on this computer.</p>
          <button class="atlas-link" disabled={busy} onclick={() => run(connect)}>Continue with ChatGPT</button>
        {/if}
        {#if aiStore.companion?.message}<p role="status">{aiStore.companion.message}</p>{/if}
      {:else}
        <ReflectionAccount/>
      {/if}
      {#if aiAvailable && isCompanion}<a class="atlas-link" href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage usage</a>{/if}
      {#if error}<p role="alert" class="error">{error}</p>{/if}
      <div class="sheet-foot"><button class="atlas-link" onclick={() => show = false}>Return</button></div>
    </div>
  </div>
{/if}
<style>
  .soon{margin-top:calc(-1 * var(--space-3))}
  .models{display:grid;justify-items:start}
  .error{color:var(--danger)}
</style>
