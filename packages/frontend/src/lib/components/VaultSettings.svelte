<script lang="ts">
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/modal.js';
  import { vaultStore, loadVault, didLock, lockVault } from '$lib/stores/vault.svelte.js';
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { downloadFile } from '$lib/story.js';
  import { isCompanion } from '$lib/api.js';
  let { show = $bindable(false) }: { show: boolean } = $props();
  let busy = $state(false), error = $state(''), message = $state(''), confirmDelete = $state(false);
  let legacy = $state<{ migrated: boolean; entries: number } | null>(null);
  let recoveryCopies = $state<string[]>([]);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    busy = true; error = ''; message = '';
    try { await action(); await loadVault(); }
    catch (e) { error = e instanceof Error ? e.message : 'Could not complete that change.'; }
    finally { busy = false; }
  }
  async function preferences(aiAllowed: boolean, automaticAI: boolean) {
    await companionRequest('vault/preferences', 'PATCH', { aiAllowed, automaticAI });
  }
  $effect(() => { if (show) untrack(() => run(async () => {
    if (isCompanion) legacy = await companionRequest('vault/legacy');
    else { const { browserVault } = await import('$lib/web-vault.js'); recoveryCopies = await browserVault().recoveryCopies(); }
  })); });
</script>
{#if show}
  <div class="privacy-screen" use:modal={{ dismiss: () => { if (!busy) show = false; } }} role="dialog" aria-modal="true" aria-label="Privacy and storage" tabindex="-1" onclick={e => { if (!busy && e.target === e.currentTarget) show = false; }} onkeydown={e => { if (!busy && e.key === 'Escape') show = false; }} transition:fade={{ duration: 450, easing: cubicOut }}>
    <div class="privacy-settings">
      <p class="quiet">privacy & storage</p>
      <h2>Your words. Your key.</h2>
      <p>Your journal is encrypted {isCompanion ? 'on this computer' : 'in this browser'}. It locks after 15 minutes without keyboard or pointer activity. Unsaved words disappear when it locks.</p>
      <button disabled={busy} onclick={() => run(async () => { await lockVault(); show = false; })}>lock my space now</button>
      <button disabled={busy} onclick={() => run(async () => { const encrypted = await companionRequest('vault/backup'); downloadFile(JSON.stringify(encrypted), `lacuna-${new Date().toISOString().slice(0, 10)}.${isCompanion ? 'lacuna-vault' : 'lacuna-web-vault'}`, 'application/json'); message = 'Encrypted backup downloaded. Keep it and your passphrase somewhere you can recover.'; })}>download an encrypted backup</button>
      <p class="quiet">The backup stays encrypted outside this app. Restore it from the lock screen with {isCompanion ? 'the same ChatGPT identity and ' : ''}your passphrase.</p>
      {#if isCompanion}
      <section>
        <h3>Choose what leaves this computer.</h3>
        <p>Reflections send journal context directly to OpenAI: thoughts being analyzed, up to 20 recent thoughts for a reflection, and accumulated concepts, summaries, and an earlier memoir where needed. Generated writing returns to your encrypted vault. This sharing is separate from signing in.</p>
        <label><input type="checkbox" checked={vaultStore.status?.aiAllowed ?? false} disabled={busy} onchange={e => run(() => preferences(e.currentTarget.checked, false))} /> Allow journal context to be sent to OpenAI for reflections</label>
        <label><input type="checkbox" checked={vaultStore.status?.automaticAI ?? false} disabled={busy || !vaultStore.status?.aiAllowed} onchange={e => run(() => preferences(true, e.currentTarget.checked))} /> Reflect automatically after I save a thought</label>
        <p class="quiet">Both start off. With sharing on and automatic reflections off, use “refresh reflections” in AI & ChatGPT plan. OpenAI must read the shared context to respond. Requests use store: false; this is not a promise of zero retention.</p>
      </section>
      <section>
        <h3>An optional encrypted cloud copy.</h3>
        <p>Sync uploads only the encrypted vault to Lacuna’s Cloudflare database. The passphrase and encryption key stay here. Cloud sync is off by default; there is no password reset for the vault.</p>
        <label><input type="checkbox" checked={vaultStore.status?.sync.enabled ?? false} disabled={busy} onchange={e => run(() => companionRequest('vault/sync', 'POST', { enabled: e.currentTarget.checked }))} /> Sync my encrypted journal after local saves</label>
        <p class="quiet">{vaultStore.status?.sync.lastSync ? `Last upload: ${new Date(vaultStore.status.sync.lastSync).toLocaleString()}` : 'No successful upload on this device.'} A different cloud version pauses uploads; it is never silently overwritten. Sync requires the same ChatGPT identity and a supported vault size (about 4.5 MB before encryption).</p>
        {#if vaultStore.status?.sync.error}<p role="status">{vaultStore.status.sync.error}</p>{/if}
        {#if vaultStore.status?.sync.enabled}<button disabled={busy} onclick={() => run(() => companionRequest('vault/sync', 'POST', { enabled: true }))}>sync now / retry</button>{/if}
        <p class="quiet">To restore a copy, lock this space and choose restore. Restoring disables AI sharing and sync on this device. A prior local copy is kept as an encrypted backup.</p>
        <button disabled={busy} onclick={() => { if (!confirmDelete) { confirmDelete = true; return; } run(async () => { await companionRequest('vault/sync', 'DELETE'); confirmDelete = false; message = 'The active cloud copy is deleted. Provider backups expire on their own schedule.'; }); }}>{confirmDelete ? 'confirm deletion of the cloud copy' : 'delete encrypted cloud copy'}</button>
        <p class="quiet">Turning sync off stops future uploads and keeps an existing cloud copy. Deleting it removes the active copy; Cloudflare backup history may retain ciphertext temporarily.</p>
      </section>
      {#if legacy && !legacy.migrated}
        <section>
          <h3>Bring an older journal home.</h3>
          <p>{legacy.entries ? `${legacy.entries} older thoughts remain in the original cloud storage.` : 'Check this identity for older cloud journal data.'} Older releases saved readable journal content on the server. This step downloads it, saves and verifies an encrypted local copy, then removes the active plaintext cloud records.</p>
          <button disabled={busy} onclick={() => run(async () => { await companionRequest('vault/migrate', 'POST'); legacy = await companionRequest('vault/legacy'); didLock(); show = false; })}>move and verify my older cloud journal</button>
          <p class="quiet">Backups can retain older plaintext until they expire. Other ChatGPT registrations or retired email accounts are separate identities and are not automatically merged.</p>
        </section>
      {/if}
      {:else}
        <section>
          <h3>Only on this device.</h3>
          <p>Your journal is saved in this browser’s storage. No journal content or passphrase is sent to Lacuna or OpenAI. This browser version does not currently sync to a cloud account or generate ChatGPT reflections.</p>
          <p>Clearing site data, using a private tab, losing your device, or browser storage cleanup can erase the only copy. Keep an encrypted backup somewhere safe. You can restore a browser backup on another phone or computer using its original passphrase.</p>
          <p class="quiet">Browser backups and desktop companion backups have different formats. Existing companion journals remain on the computer that holds them.</p>
          {#if recoveryCopies.length}<h3>Copies kept before a restore.</h3><p>These files remain encrypted with their original passphrase.</p>{/if}
          {#each recoveryCopies as id}
            <button disabled={busy} onclick={() => run(async () => { const { browserVault } = await import('$lib/web-vault.js'); const encrypted = await browserVault().recoveryCopy(id); downloadFile(JSON.stringify(encrypted), `lacuna-restore-copy-${id.split(':')[1]}.lacuna-web-vault`, 'application/json'); })}>download copy from {new Date(Number(id.split(':')[1])).toLocaleString()}</button>
          {/each}
        </section>
      {/if}
      {#if error}<p role="alert">{error}</p>{/if}
      {#if message}<p role="status">{message}</p>{/if}
      <a href="/privacy">read our privacy declaration</a>
      <button disabled={busy} onclick={() => show = false}>return to my space</button>
    </div>
  </div>
{/if}
<style>
  .privacy-screen { position: fixed; inset: 0; z-index: 225; background: color-mix(in srgb, var(--bg) 96%, transparent); backdrop-filter: blur(20px); overflow-y: auto; padding: 4rem 1.5rem; }
  .privacy-settings { max-width: 46ch; margin: auto; display: flex; flex-direction: column; gap: 1.8rem; line-height: 1.9; letter-spacing: .02em; }
  h2 { font: 400 2.4rem/1.5 var(--font-reading); } h3 { font: 400 1.35rem/1.7 var(--font-reading); margin-bottom: 1.2rem; }
  p { color: var(--void-text-dim); } section { margin: 1.2rem 0; display: flex; flex-direction: column; gap: 1.3rem; }
  label { display: flex; align-items: baseline; gap: .9rem; cursor: pointer; } input { accent-color: var(--moss); flex-shrink: 0; }
  button, a { color: var(--void-text); border: none; background: none; font: inherit; line-height: 1.8; text-align: left; padding: .35rem 0; text-decoration: none; cursor: pointer; transition: color .3s ease; }
  button:hover, a:hover { color: var(--moss); } button:disabled { opacity: .5; cursor: default; } .quiet { color: var(--void-text-hint); font-size: .82rem; }
</style>
