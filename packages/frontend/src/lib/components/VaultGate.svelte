<script lang="ts">
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { vaultStore, loadVault } from '$lib/stores/vault.svelte.js';
  import { api } from '$lib/api.js';
  import { signOut } from '$lib/stores/session.svelte.js';
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
      passphrase = ''; confirmation = ''; await loadVault();
    } catch (e) { error = e instanceof Error ? e.message : 'Could not unlock the vault.'; }
    finally { busy = false; }
  }
</script>
<main class="vault-gate">
  <form onsubmit={e => { e.preventDefault(); unlock(); }}>
    <span class="seed" aria-hidden="true">✧</span>
    <p class="quiet">lacuna · your private space</p>
    <h1>{restoring ? 'Bring your words home.' : vaultStore.status?.exists ? 'A space only you can open.' : 'Give your words a safe place.'}</h1>
    <p>{restoring ? 'Restore a cloud copy or choose an encrypted backup file for this ChatGPT identity. Any existing local vault is backed up as ciphertext before replacement.' : vaultStore.status?.exists ? 'Unlock the encrypted journal on this computer.' : 'Create a passphrase to encrypt your journal on this computer. Cloud sync and AI sharing start off.'}</p>
    {#if restoring}<label for="vault-backup">Encrypted backup file (optional; leave empty for cloud)</label><input id="vault-backup" type="file" accept=".lacuna-vault,application/json" disabled={busy} onchange={e => backup = e.currentTarget.files?.[0] ?? null} />{/if}
    <label for="vault-passphrase">Vault passphrase</label>
    <input id="vault-passphrase" type="password" bind:value={passphrase} autocomplete={vaultStore.status?.exists || restoring ? 'current-password' : 'new-password'} minlength="12" maxlength="1024" required disabled={busy} />
    {#if !vaultStore.status?.exists && !restoring}
      <label for="vault-confirmation">Repeat passphrase</label>
      <input id="vault-confirmation" type="password" bind:value={confirmation} autocomplete="new-password" minlength="12" maxlength="1024" required disabled={busy} />
    {/if}
    <p class="quiet">At least 12 characters. Use a long, unique passphrase and save it in your password manager. We cannot recover it. Losing it can mean losing your journal.</p>
    <button disabled={busy}>{busy ? 'opening…' : restoring ? 'restore encrypted copy' : vaultStore.status?.exists ? 'unlock my space' : 'create my private vault'}</button>
    {#if error}<p role="alert">{error}</p>{/if}
    <button class="quiet" type="button" disabled={busy} onclick={() => { restoring = !restoring; error = ''; passphrase = ''; confirmation = ''; backup = null; }}>{restoring ? 'return to this device' : 'restore an encrypted cloud copy or backup'}</button>
    <a class="quiet" href="/privacy">our privacy declaration</a>
    <button class="quiet" type="button" disabled={busy} onclick={async () => { try { await api.auth.logout(); signOut(); } catch { error = 'Could not sign out. Try again.'; } }}>sign out</button>
  </form>
</main>
<style>
  .vault-gate { position: fixed; inset: 0; overflow-y: auto; display: flex; align-items: safe center; justify-content: center; padding: 3rem 1.5rem; background: var(--bg); }
  form { width: 100%; max-width: 38ch; display: flex; flex-direction: column; gap: 1.3rem; text-align: center; line-height: 1.8; }
  h1 { font: 400 2rem/1.5 var(--font-reading); margin: .5rem 0; }
  p { color: var(--void-text-dim); } label { color: var(--void-text-dim); font-size: .85rem; }
  input { width: 100%; background: transparent; border: none; border-bottom: 1px solid var(--void-text-hint); border-radius: 0; padding: .6rem; text-align: center; color: var(--void-text); font: inherit; }
  button, a { background: none; border: none; color: var(--void-text); font: inherit; line-height: 1.8; padding: .4rem; cursor: pointer; text-decoration: none; transition: color .3s ease; }
  button:hover, a:hover { color: var(--moss); } .quiet { font-size: .8rem; color: var(--void-text-hint); }
</style>
