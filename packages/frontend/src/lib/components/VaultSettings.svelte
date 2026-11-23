<script lang="ts">
  import { aiAvailable } from '../../../../shared/ai-release.js';
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/modal.js';
  import { vaultStore, loadVault, didLock, lockVault } from '$lib/stores/vault.svelte.js';
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { downloadFile } from '$lib/story.js';
  import { isCompanion } from '$lib/api.js';
  import BrowserSync from './BrowserSync.svelte';
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
  <div class="sheet-screen" style:z-index="225" use:modal={{ dismiss: () => { if (!busy) show = false; } }} role="dialog" aria-modal="true" aria-label="Privacy and storage" tabindex="-1" onclick={e => { if (!busy && e.target === e.currentTarget) show = false; }} onkeydown={e => { if (!busy && e.key === 'Escape') show = false; }} transition:fade={{ duration: 400, easing: cubicOut }}>
    <div class="journal-sheet">
      <h2>Privacy &amp; storage</h2>
      <p>Your journal is encrypted {isCompanion ? 'on this computer' : 'in this browser'}. It locks after 15 minutes without keyboard or pointer activity. Unsaved words disappear when it locks.</p>
      <button class="atlas-link" disabled={busy} onclick={() => run(async () => { await lockVault(); show = false; })}>Lock my space now</button>
      <button class="atlas-link" disabled={busy} onclick={() => run(async () => { const encrypted = await companionRequest('vault/backup'); downloadFile(JSON.stringify(encrypted), `lacuna-${new Date().toISOString().slice(0, 10)}.${isCompanion ? 'lacuna-vault' : 'lacuna-web-vault'}`, 'application/json'); message = 'Encrypted backup downloaded. Keep it and your passphrase somewhere you can recover.'; })}>Download an encrypted backup</button>
      <p class="note">The backup stays encrypted outside this app. Restore it from the lock screen with {isCompanion ? 'the same ChatGPT identity and ' : ''}your passphrase.</p>
      {#if isCompanion}
      <section>
        {#if aiAvailable}
        <h3>Choose what leaves this computer.</h3>
        <p>Reflections send journal context directly to OpenAI: thoughts being analyzed, up to 20 recent thoughts for a reflection, and accumulated concepts, summaries, and an earlier memoir where needed. Generated writing returns to your encrypted vault. This sharing is separate from signing in.</p>
        <label><input type="checkbox" checked={vaultStore.status?.aiAllowed ?? false} disabled={busy} onchange={e => run(() => preferences(e.currentTarget.checked, false))} /> Allow journal context to be sent to OpenAI for reflections</label>
        <label><input type="checkbox" checked={vaultStore.status?.automaticAI ?? false} disabled={busy || !vaultStore.status?.aiAllowed} onchange={e => run(() => preferences(true, e.currentTarget.checked))} /> Reflect automatically after I save a thought</label>
        <p class="note">Both start off. With sharing on and automatic reflections off, use “refresh reflections” in AI & ChatGPT plan. OpenAI must read the shared context to respond. Requests use store: false; this is not a promise of zero retention.</p>
        {:else}<h3>AI reflections · Coming soon</h3>{/if}
      </section>
      <section>
        <h3>An optional encrypted cloud copy.</h3>
        <p>Sync uploads only the encrypted vault to Lacuna’s Cloudflare database. The passphrase and encryption key stay here. Cloud sync is off by default; there is no password reset for the vault.</p>
        <label><input type="checkbox" checked={vaultStore.status?.sync.enabled ?? false} disabled={busy} onchange={e => run(() => companionRequest('vault/sync', 'POST', { enabled: e.currentTarget.checked }))} /> Sync my encrypted journal after local saves</label>
        <p class="note">{vaultStore.status?.sync.lastSync ? `Last upload: ${new Date(vaultStore.status.sync.lastSync).toLocaleString()}` : 'No successful upload on this device.'} A different cloud version pauses uploads; it is never silently overwritten. Sync requires the same ChatGPT identity and a supported vault size (about 4.5 MB before encryption).</p>
        {#if vaultStore.status?.sync.error}<p role="status">{vaultStore.status.sync.error}</p>{/if}
        {#if vaultStore.status?.sync.enabled}<button class="atlas-link" disabled={busy} onclick={() => run(() => companionRequest('vault/sync', 'POST', { enabled: true }))}>Sync now / retry</button>{/if}
        <p class="note">To restore a copy, lock this space and choose restore. Restoring disables AI sharing and sync on this device. A prior local copy is kept as an encrypted backup.</p>
        <button class="atlas-link danger" disabled={busy} onclick={() => { if (!confirmDelete) { confirmDelete = true; return; } run(async () => { await companionRequest('vault/sync', 'DELETE'); confirmDelete = false; message = 'The active cloud copy is deleted. Provider backups expire on their own schedule.'; }); }}>{confirmDelete ? 'Confirm deletion of the cloud copy' : 'Delete encrypted cloud copy'}</button>
        <p class="note">Turning sync off stops future uploads and keeps an existing cloud copy. Deleting it removes the active copy; Cloudflare backup history may retain ciphertext temporarily.</p>
      </section>
      {#if legacy && !legacy.migrated}
        <section>
          <h3>Bring an older journal home.</h3>
          <p>{legacy.entries ? `${legacy.entries} older thoughts remain in the original cloud storage.` : 'Check this identity for older cloud journal data.'} Older releases saved readable journal content on the server. This step downloads it, saves and verifies an encrypted local copy, then removes the active plaintext cloud records.</p>
          <button class="atlas-link" disabled={busy} onclick={() => run(async () => { await companionRequest('vault/migrate', 'POST'); legacy = await companionRequest('vault/legacy'); didLock(); show = false; })}>Move and verify my older cloud journal</button>
          <p class="note">Backups can retain older plaintext until they expire. Other ChatGPT registrations or retired email accounts are separate identities and are not automatically merged.</p>
        </section>
      {/if}
      {:else}
        <BrowserSync/>
        <section>
          <h3>Your encrypted journal</h3>
          <p>An encrypted backup opens with your original passphrase. A browser file restore starts with sync off.</p>
          <p>Clearing site data, using a private tab, losing your device, or browser storage cleanup can erase the only copy. Keep an encrypted backup somewhere safe. You can restore a browser backup on another phone or computer using its original passphrase.</p>
          <p class="note">Browser backups and desktop companion backups have different formats. Use the desktop companion to open a companion backup.</p>
          {#if recoveryCopies.length}<h3>Copies kept before a restore.</h3><p>These files remain encrypted with their original passphrase.</p>{/if}
          {#each recoveryCopies as id}
            <button class="atlas-link" disabled={busy} onclick={() => run(async () => { const { browserVault } = await import('$lib/web-vault.js'); const encrypted = await browserVault().recoveryCopy(id); downloadFile(JSON.stringify(encrypted), `lacuna-restore-copy-${id.split(':')[1]}.lacuna-web-vault`, 'application/json'); })}>Download copy from {new Date(Number(id.split(':')[1])).toLocaleString()}</button>
          {/each}
        </section>
      {/if}
      {#if error}<p role="alert" class="error">{error}</p>{/if}
      {#if message}<p role="status">{message}</p>{/if}
      <div class="sheet-foot">
        <button class="atlas-link" disabled={busy} onclick={() => show = false}>Return to my space</button>
        <a class="atlas-link subtle" href="/privacy">Privacy declaration</a>
      </div>
    </div>
  </div>
{/if}
<style>
  .error{color:var(--danger)}
</style>
