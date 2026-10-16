<script lang="ts">
  import { fade } from 'svelte/transition';
  import { modal } from '$lib/modal.js';
  import { api } from '$lib/api.js';
  import { archiveMarkdown, downloadFile } from '$lib/story.js';
  import { sessionVersion } from '$lib/session-version.js';
  let { show = $bindable(false) }: { show: boolean } = $props();
  let busy = $state(false), error = $state(''), done = $state(false);
  async function take(format: 'markdown' | 'json') {
    if (busy) return;
    const version = sessionVersion.value;
    busy = true; error = ''; done = false;
    try {
      const archive = await api.story.export();
      if (version !== sessionVersion.value) return;
      const day = archive.exported_at.slice(0, 10);
      if (format === 'json') downloadFile(JSON.stringify(archive, null, 2), `lacuna-${day}.json`, 'application/json');
      else downloadFile(archiveMarkdown(archive), `lacuna-${day}.md`, 'text/markdown;charset=utf-8');
      done = true;
    } catch { error = 'Could not gather your archive. Try again.'; }
    finally { busy = false; }
  }
</script>
{#if show}
  <div class="export-screen" use:modal={{ dismiss: () => show = false }} role="dialog" aria-modal="true" aria-label="Take your words with you" tabindex="-1" onclick={e => { if (e.target === e.currentTarget) show = false; }} onkeydown={e => { if (e.key === 'Escape') show = false; }} transition:fade={{ duration: 400 }}>
    <div class="export-content">
      <span class="seed" aria-hidden="true">✧</span>
      <h2>Your words belong to you.</h2>
      <p>Take a copy of every saved thought and every memoir edition. Keep it somewhere private.</p>
      <button disabled={busy} onclick={() => take('markdown')}>a readable book · Markdown</button>
      <button disabled={busy} onclick={() => take('json')}>the complete archive · JSON</button>
      <p class="quiet">The complete archive also includes your concept map and generated reflections.</p>
      {#if done}<p role="status" class="quiet">Your archive is ready in your downloads.</p>{/if}
      {#if error}<p role="alert">{error}</p>{/if}
      <button class="return" onclick={() => show = false}>return</button>
    </div>
  </div>
{/if}
<style>
  .export-screen { position: fixed; inset: 0; z-index: 220; display: flex; align-items: safe center; justify-content: center; overflow-y: auto; background: color-mix(in srgb, var(--bg) 94%, transparent); backdrop-filter: blur(22px); padding: 3rem 1.5rem; }
  .export-content { max-width: 35ch; text-align: center; display: flex; flex-direction: column; gap: 1.5rem; line-height: 1.9; }
  h2 { font: 400 2rem/1.4 var(--font-reading); }
  p { color: var(--void-text-dim); }
  button { border: none; background: none; color: var(--void-text); font: inherit; line-height: 1.8; padding: .5rem 0; cursor: pointer; transition: color .3s ease; }
  button:hover { color: var(--moss); }
  .return { color: var(--void-text-hint); font-size: .85rem; margin-top: 1rem; }
</style>
