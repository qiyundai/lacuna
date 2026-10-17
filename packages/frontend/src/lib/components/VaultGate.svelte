<script lang="ts">
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { vaultStore, loadVault } from '$lib/stores/vault.svelte.js';
  import { api, isCompanion } from '$lib/api.js';
  import { signOut, setAuthed } from '$lib/stores/session.svelte.js';
  let passphrase = $state(''), confirmation = $state(''), error = $state(''), busy = $state(false), restoring = $state(false);
  let backup = $state<File | null>(null);
  async function unlock() {
    if (busy) return;
    if (!restoring && !vaultStore.status?.exists && passphrase !== confirmation) { error = 'The passphrases do not match.'; return; }
    busy = true; error = '';
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
<main class="vault-gate">
  <form onsubmit={e => { e.preventDefault(); unlock(); }}>
    <span class="seed" aria-hidden="true">✧</span>
    <p class="quiet">lacuna</p>
    <h1>{restoring ? 'Bring your words home.' : vaultStore.status?.exists ? 'Welcome back to your space.' : 'Your words, wherever you are.'}</h1>
    <p>{isCompanion ? (restoring ? 'Restore a cloud copy or choose an encrypted backup file for this ChatGPT identity. Any existing local vault is backed up as ciphertext before replacement.' : 'Your journal is encrypted on this computer. Unlock it or create a private vault.') : (restoring ? 'Choose an encrypted Lacuna browser backup and use its original passphrase. Your current encrypted copy is backed up before replacement.' : vaultStore.status?.exists ? 'Your journal is here, encrypted in this browser. Only your passphrase can open it.' : 'A private writing space, right here in your browser. No account or installation. Your passphrase keeps your words private.')}</p>
    {#if restoring}<label for="vault-backup">{isCompanion ? 'Encrypted backup file (optional; leave empty for cloud)' : 'Encrypted browser backup'}</label><input id="vault-backup" type="file" accept=".lacuna-vault,.lacuna-web-vault,application/json" required={!isCompanion} disabled={busy} onchange={e => backup = e.currentTarget.files?.[0] ?? null} />{/if}
    <label for="vault-passphrase">Vault passphrase</label>
    <input id="vault-passphrase" type="password" bind:value={passphrase} autocomplete={vaultStore.status?.exists || restoring ? 'current-password' : 'new-password'} minlength="12" maxlength="1024" required disabled={busy} />
    {#if !vaultStore.status?.exists && !restoring}
      <label for="vault-confirmation">Repeat passphrase</label>
      <input id="vault-confirmation" type="password" bind:value={confirmation} autocomplete="new-password" minlength="12" maxlength="1024" required disabled={busy} />
    {/if}
    <p class="quiet">Use 12+ characters and save it in your password manager. There is no reset.{#if !isCompanion}<span> Keep an encrypted backup; clearing browser data can erase your journal.</span>{/if}</p>
    <button disabled={busy}>{busy ? 'opening…' : restoring ? 'restore encrypted copy' : vaultStore.status?.exists ? 'unlock my space' : 'create my private space'}</button>
    {#if error}<p role="alert">{error}</p>{/if}
    <button class="quiet" type="button" disabled={busy} onclick={() => { restoring = !restoring; error = ''; passphrase = ''; confirmation = ''; backup = null; }}>{restoring ? 'return to this device' : isCompanion ? 'restore an encrypted cloud copy or backup' : 'restore a browser backup'}</button>
    <a class="quiet" href="/privacy">our privacy declaration</a>
    {#if isCompanion}<button class="quiet" type="button" disabled={busy} onclick={async () => { try { await api.auth.logout(); signOut(); } catch { error = 'Could not sign out. Try again.'; } }}>sign out</button>{/if}
  </form>
</main>
<style>
  .vault-gate { position: fixed; inset: 0; overflow-y: auto; display: flex; align-items: safe center; justify-content: center; padding: 3rem 1.5rem; background: var(--bg); }
  form { width: 100%; max-width: 38ch; display: flex; flex-direction: column; gap: 1.3rem; text-align: center; line-height: 1.8; }
  h1 { font: 400 2rem/1.5 var(--font-reading); margin: .5rem 0; }
  p { color: var(--void-text-dim); } label { color: var(--void-text-dim); font-size: .85rem; }
  input { width: 100%; background: transparent; border: none; border-bottom: 1px solid var(--void-text-hint); border-radius: 0; padding: .6rem; text-align: center; color: var(--void-text); font: inherit; font-size: 1rem; }
  button, a { background: none; border: none; color: var(--void-text); font: inherit; line-height: 1.8; padding: .4rem; cursor: pointer; text-decoration: none; transition: color .3s ease; }
  button:hover, a:hover { color: var(--moss); } .quiet { font-size: .8rem; color: var(--void-text-hint); }
  @media (max-width: 600px) {
    .vault-gate { padding: 1.5rem; }
    form { gap: .85rem; line-height: 1.7; }
    .seed { display: none; }
    h1 { font-size: 1.8rem; margin: .35rem 0; }
    input { padding: .4rem; }
    .quiet { font-size: .75rem; }
  }
</style>
