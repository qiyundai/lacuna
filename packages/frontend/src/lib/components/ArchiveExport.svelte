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
  <div class="sheet-screen" style:z-index="220" use:modal={{ dismiss: () => show = false }} role="dialog" aria-modal="true" aria-label="Take your words with you" tabindex="-1" onclick={e => { if (e.target === e.currentTarget) show = false; }} onkeydown={e => { if (e.key === 'Escape') show = false; }} transition:fade={{ duration: 400 }}>
    <div class="journal-sheet">
      <h2>Export journal</h2>
      <p>Markdown and JSON exports contain your saved words in readable text. Anyone with the file can read them, even after you forget a page. For a file you can restore with your passphrase, choose Download an encrypted backup in Privacy &amp; storage.</p>
      <div class="formats">
        <button class="format" disabled={busy} onclick={() => take('markdown')}><span>A readable book</span><small>Markdown</small></button>
        <button class="format" disabled={busy} onclick={() => take('json')}><span>The complete archive</span><small>JSON</small></button>
      </div>
      <p class="note">JSON also includes any saved reflections and concept map data.</p>
      {#if done}<p role="status" class="note">Your archive is ready in your downloads.</p>{/if}
      {#if error}<p role="alert" class="error">{error}</p>{/if}
      <div class="sheet-foot"><button class="atlas-link" onclick={() => show = false}>Return</button></div>
    </div>
  </div>
{/if}
<style>
  .formats{display:grid;border-block:1px solid var(--rule)}
  .format{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-4);min-height:64px;padding:0;border:0;background:none;color:var(--ink);font:400 var(--display-3)/var(--lh-heading) var(--font);letter-spacing:var(--ls-heading);text-align:start;cursor:pointer;transition:color var(--dur-micro) var(--ease-soft)}
  .format + .format{border-top:1px solid var(--rule)}
  .format small{font:400 var(--ui-sm)/1 var(--font);letter-spacing:var(--ls-label);text-transform:uppercase;color:var(--ink-subtle)}
  .format:enabled:hover{color:var(--accent)}
  .error{color:var(--danger)}
</style>
