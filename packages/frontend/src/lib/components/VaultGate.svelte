<script lang="ts">
  import TownWelcome from './TownWelcome.svelte';
  import { vaultStore, vaultRequest, loadVault } from '$lib/stores/vault.svelte.js';
  import { setAuthed } from '$lib/stores/session.svelte.js';
  import { linkDevice } from '$lib/browser-sync.js';
  import { passkeysSupported, readRecoveryPasskey } from '$lib/sync-passkey.js';
  import { browserVault } from '$lib/web-vault.js';
  import { prepareValleyAudio, leaveValley, willPlaySound } from '$lib/valley-playback.svelte.js';
  import SoundCue from './SoundCue.svelte';
  let linking=$state(false),code=$state(''),fromPasskey=$state(false);
  const passkeys=passkeysSupported();
  let passphrase = $state(''), confirmation = $state(''), error = $state(''), busy = $state(false), restoring = $state(false);
  let backup = $state<File | null>(null);
  let mismatch = $state(false);
  let repeatField = $state<HTMLInputElement>();
  const existing = $derived(vaultStore.status?.exists === true);
  const action = $derived(existing ? 'Unlock journal' : 'Create journal');
  const submitLabel=$derived(busy?'Opening…':linking?'Link this device':restoring?'Restore journal':action);
  const audible=$derived(willPlaySound());
  async function unlock() {
    if (busy) return;
    if (!restoring && !linking && !vaultStore.status?.exists && passphrase !== confirmation) { mismatch = true; error = 'Enter the same passphrase in both fields.'; repeatField?.focus(); return; }
    busy = true; error = ''; mismatch = false;
    prepareValleyAudio();
    try {
      if (backup && backup.size > 23 * 1024 * 1024) throw new Error('This backup is too large.');
      const envelope = restoring && backup ? JSON.parse(await backup.text()) : undefined;
      if (linking) await linkDevice(browserVault(),code.trim(),passphrase,fetch,fromPasskey);
      else await vaultRequest(restoring ? 'vault/restore' : 'vault/unlock', 'POST', { passphrase, create: !vaultStore.status?.exists, ...(envelope ? { envelope } : {}) });
      code=''; fromPasskey=false;
      passphrase = ''; confirmation = '';
      setAuthed({ id: 'this-browser', email: 'on this device' });
      await loadVault();
    } catch (e) { leaveValley(); error = e instanceof Error ? e.message : 'Could not unlock the vault.'; }
    finally { busy = false; }
  }
  async function usePasskey() {
    if (busy) return;
    busy = true; error = '';
    try { code = await readRecoveryPasskey(); fromPasskey = true; }
    catch (e) { error = e instanceof Error ? e.message : 'The passkey could not be read.'; }
    finally { busy = false; }
  }
</script>
<TownWelcome {action}>
  <form class="atlas-form" aria-labelledby="vault-title" method="post" onsubmit={e => { e.preventDefault(); unlock(); }}>
    <h1 id="vault-title" tabindex="-1">{linking?'Link a synced journal':restoring ? 'Restore your journal' : existing ? 'Open your journal' : 'Start your journal'}</h1>
    {#if linking}
      {#if fromPasskey}
        <p role="status">Your recovery passkey found this journal. Enter its original passphrase to open it here.{existing?' Your current journal will be kept as an encrypted recovery copy.':''}</p>
      {:else}
        <p>{passkeys?'Use the recovery passkey you saved, or enter':'Enter'} the private code from another device’s Privacy &amp; storage settings, and the original journal passphrase.{existing?' Your current journal will be kept as an encrypted recovery copy.':''}</p>
        {#if passkeys}<button class="atlas-link" type="button" disabled={busy} onclick={usePasskey}>Use my recovery passkey</button>{/if}
        <div class="field"><label for="sync-code">Pairing code</label><input id="sync-code" type="password" bind:value={code} autocomplete="off" spellcheck="false" required disabled={busy}/></div>
      {/if}
    {:else}
    <p>{restoring ? 'Choose an encrypted backup and enter its original passphrase. An existing journal is backed up first. File restores start with sync off.' : existing ? 'Your passphrase opens your journal and your city.' : 'Choose a passphrase to keep your writing encrypted on this device.'}</p>
    {#if restoring}<div class="field"><label for="vault-backup">Encrypted backup</label><input id="vault-backup" type="file" accept=".lacuna-web-vault,application/json" required disabled={busy} onchange={e => backup = e.currentTarget.files?.[0] ?? null} /></div>{/if}
    {/if}
    <div class="field"><label for="vault-passphrase">Passphrase</label>
      <input id="vault-passphrase" type="password" bind:value={passphrase} autocomplete={existing || restoring || linking ? 'current-password' : 'new-password'} minlength="12" maxlength="1024" required disabled={busy} aria-describedby="key-help" oninput={() => {error='';mismatch=false;}}/>
    </div>
    {#if !existing && !restoring && !linking}
      <div class="field"><label for="vault-confirmation">Repeat passphrase</label>
        <input bind:this={repeatField} id="vault-confirmation" type="password" bind:value={confirmation} autocomplete="new-password" minlength="12" maxlength="1024" required disabled={busy} aria-invalid={mismatch} aria-describedby={mismatch?'key-error':undefined} oninput={()=>{error='';mismatch=false;}}/>
      </div>
    {/if}
    <p class="field-note" id="key-help">{restoring || existing || linking ? 'Use the passphrase you originally chose.' : 'Use at least 12 characters. Keep your passphrase and an encrypted backup somewhere safe. A lost passphrase cannot be reset.'}</p>
    {#if error}<p class="form-error" role="alert" id="key-error">{error}</p>{/if}
    <button class="atlas-primary" type="submit" disabled={busy} aria-label={submitLabel+(audible&&!busy?' and enter the valley with sound':'')}>{submitLabel}{#if !busy}<SoundCue/>{/if}</button>
    <div class="atlas-links">
      {#if !restoring}<button class="atlas-link" type="button" disabled={busy} onclick={()=>{linking=!linking;code='';fromPasskey=false;passphrase='';confirmation='';error='';mismatch=false;}}>{linking?'Return to this device':'Link a synced journal'}</button>{/if}
    {#if !linking}
    <button class="atlas-link" type="button" disabled={busy} onclick={() => { restoring = !restoring; error = ''; mismatch=false; passphrase = ''; confirmation = ''; backup = null; }}>{restoring ? 'Return to this device' : 'Restore from backup'}</button>
    {/if}
    </div>
    <a class="atlas-link" href="/billing">Manage billing</a>
  </form>
</TownWelcome>
