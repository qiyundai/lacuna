<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { isCompanion } from '$lib/api.js';
  import { aiStore, loadAI, companionRequest } from '$lib/stores/ai.svelte.js';
  import { modal } from '$lib/modal.js';
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
    if (!show) return;
    untrack(() => run(async () => {
      await loadAI();
      if (isCompanion && aiStore.companion?.connected) models = await companionRequest('models');
    }));
  });
  onMount(() => {
    const timer = setInterval(() => { if (show) loadAI().then(() => { if (aiStore.companion?.state === 'complete') { loadPatterns(); loadMemoir(); } }).catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  });
</script>
{#if show}
  <div class="plan-screen" use:modal={{ dismiss: () => show = false }} role="dialog" aria-modal="true" aria-label="AI and ChatGPT plan" tabindex="-1"
    onclick={(event) => { if (event.target === event.currentTarget) show = false; }} onkeydown={(event) => { if (event.key === 'Escape') show = false; }} transition:fade={{ duration: 500, easing: cubicOut }}>
    <div class="plan-content">
      <p>your reflections</p>
      {#if isCompanion}
        <p>using your ChatGPT plan. eligible requests use your plan allowance or credits. enable journal sharing in privacy & storage before refreshing reflections.</p>
        {#if aiStore.companion?.connected}
          <p>{aiStore.companion.email}</p>
          {#if !aiStore.companion.planEnabled}<p>you’re signed in. reconnect and allow ChatGPT plan use to generate reflections.</p>{/if}
          <button disabled={busy || aiStore.companion.state === 'running'} onclick={() => run(connect)}>reconnect ChatGPT</button>
          <p class="small">choose a model</p>
          <div class="models">
            {#each models as model}
              <button class:selected={(aiStore.companion.model ?? models[0]?.slug) === model.slug} disabled={busy} aria-pressed={(aiStore.companion.model ?? models[0]?.slug) === model.slug}
                onclick={() => run(() => companionRequest('model', 'PATCH', { model: model.slug }))}>{model.name}</button>
            {/each}
          </div>
          <button disabled={busy || aiStore.companion.state === 'running'} onclick={() => run(() => companionRequest('reflect', 'POST'))}>{aiStore.companion.state === 'running' ? 'reflecting…' : 'refresh reflections'}</button>
          <button disabled={busy} onclick={() => run(async () => { testResult = ''; const result = await companionRequest<{ text: string }>('test', 'POST'); testResult = result.text; })}>test ChatGPT connection</button>
          {#if testResult}<p role="status">{testResult}</p>{/if}
          <button disabled={busy} onclick={() => run(disconnect)}>disconnect ChatGPT</button>
        {:else}
          <p>use your ChatGPT plan for reflections. your journal is saved in your encrypted local vault; access and refresh tokens stay on this computer.</p>
          <button disabled={busy} onclick={() => run(connect)}>Continue with ChatGPT</button>
        {/if}
        {#if aiStore.companion?.message}<p role="status">{aiStore.companion.message}</p>{/if}
      {:else}
        <p>ChatGPT reflections are not connected in the browser app yet. You can write, search, keep thoughts close, and back up your journal here without connecting an account.</p>
        <p>Your words are not sent to AI. A future connection will ask for your permission before sharing journal context.</p>
      {/if}
      {#if isCompanion}<a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage usage</a>{/if}
      {#if error}<p role="alert">{error}</p>{/if}
      <button onclick={() => show = false}>return</button>
    </div>
  </div>
{/if}
<style>
  .plan-screen { position: fixed; inset: 0; z-index: 210; background: color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter: blur(18px); display: flex; align-items: center; justify-content: center; padding: 2rem; overflow-y: auto; }
  .plan-content { max-width: 42ch; max-height: 100%; text-align: center; display: flex; flex-direction: column; gap: 1.4rem; line-height: 1.8; letter-spacing: .03em; }
  button, a { background: none; border: none; color: var(--void-text-dim); font: inherit; cursor: pointer; text-decoration: none; line-height: 1.8; transition: color .35s ease; }
  button:hover, a:hover, button.selected { color: var(--void-text); }
  button:disabled { opacity: .45; cursor: default; }
  .small { font-size: var(--text-xs); color: var(--void-text-hint); }
  .models { display: flex; flex-direction: column; gap: .7rem; }
</style>
