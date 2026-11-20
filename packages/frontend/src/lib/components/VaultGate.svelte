<script lang="ts">
  import TownWelcome from './TownWelcome.svelte';
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { vaultStore, loadVault } from '$lib/stores/vault.svelte.js';
  import { api, isCompanion } from '$lib/api.js';
  import { signOut, setAuthed } from '$lib/stores/session.svelte.js';
  let passphrase = $state(''), confirmation = $state(''), error = $state(''), busy = $state(false), restoring = $state(false);
  let backup = $state<File | null>(null);
  let mismatch = $state(false);
  let repeatField = $state<HTMLInputElement>();
  const existing = $derived(vaultStore.status?.exists === true);
  const action = $derived(existing ? 'Unlock journal' : 'Create journal');
  async function unlock() {
    if (busy) return;
    if (!restoring && !vaultStore.status?.exists && passphrase !== confirmation) { mismatch = true; error = 'Enter the same passphrase in both fields.'; repeatField?.focus(); return; }
    busy = true; error = ''; mismatch = false;
    try {
      if (backup && backup.size > 23 * 1024 * 1024) throw new Error('This backup is too large.');
      const envelope = restoring && backup ? JSON.parse(await backup.text()) : undefined;
      await companionRequest(restoring ? 'vault/restore' : 'vault/unlock', 'POST', { passphrase, create: !vaultStore.status?.exists, ...(envelope ? { envelope } : {}) });
      passphrase = ''; confirmation = '';
      if (!isCompanion) setAuthed({ id: 'this-browser', email: 'on this device' });
      await loadVault();
    } catch (e) { error = e instanceof Error ? e.message : 'Could not unlock the vault.'; }
    finally { busy = false; }
  }
</script>
<TownWelcome {action}>
  <form class="atlas-form" aria-labelledby="vault-title" method="post" onsubmit={e => { e.preventDefault(); unlock(); }}>
    <h1 id="vault-title" tabindex="-1">{restoring ? 'Restore your journal' : existing ? 'Open your journal' : 'Start your journal'}</h1>
    <p>{restoring ? (isCompanion ? 'Choose an encrypted backup or leave the file empty to use your cloud copy. Your current vault is backed up before replacement.' : 'Choose an encrypted browser backup and enter its original passphrase. Your current encrypted copy is backed up first.') : existing ? 'Your passphrase opens your journal and your city.' : 'Choose a passphrase to keep your writing encrypted on this device.'}</p>
    {#if restoring}<div class="field"><label for="vault-backup">Encrypted backup{isCompanion ? ' (optional)' : ''}</label><input id="vault-backup" type="file" accept=".lacuna-vault,.lacuna-web-vault,application/json" required={!isCompanion} disabled={busy} onchange={e => backup = e.currentTarget.files?.[0] ?? null} /></div>{/if}
    <div class="field"><label for="vault-passphrase">Passphrase</label>
      <input id="vault-passphrase" type="password" bind:value={passphrase} autocomplete={existing || restoring ? 'current-password' : 'new-password'} minlength="12" maxlength="1024" required disabled={busy} aria-describedby="key-help" oninput={() => {error='';mismatch=false;}}/>
    </div>
    {#if !existing && !restoring}
      <div class="field"><label for="vault-confirmation">Repeat passphrase</label>
        <input bind:this={repeatField} id="vault-confirmation" type="password" bind:value={confirmation} autocomplete="new-password" minlength="12" maxlength="1024" required disabled={busy} aria-invalid={mismatch} aria-describedby={mismatch?'key-error':undefined} oninput={()=>{error='';mismatch=false;}}/>
      </div>
    {/if}
    <p class="field-note" id="key-help">{restoring || existing ? 'Use the passphrase you originally chose.' : 'Use at least 12 characters. Keep your passphrase and an encrypted backup somewhere safe. A lost passphrase cannot be reset.'}</p>
    {#if error}<p class="form-error" role="alert" id="key-error">{error}</p>{/if}
    <button class="atlas-primary" type="submit" disabled={busy}>{busy ? 'Opening…' : restoring ? 'Restore journal' : action}</button>
    <button class="atlas-link" type="button" disabled={busy} onclick={() => { restoring = !restoring; error = ''; mismatch=false; passphrase = ''; confirmation = ''; backup = null; }}>{restoring ? 'Return to this device' : 'Restore from backup'}</button>
    {#if isCompanion}<button class="atlas-link" type="button" disabled={busy} onclick={async () => { try { await api.auth.logout(); signOut(); } catch { error = 'Could not sign out. Try again.'; } }}>Sign out</button>{/if}
  </form>
</TownWelcome>
