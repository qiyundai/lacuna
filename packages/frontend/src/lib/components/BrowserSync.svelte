<script lang="ts">
  import { onMount } from 'svelte';
  import { browserVault, type DeviceSync } from '$lib/web-vault.js';
  import { newPairingCode, runBrowserSync, pauseSyncWork, removeOnline, syncMessage, hasConflict } from '$lib/browser-sync.js';
  let pairing=$state<DeviceSync>(), dirty=$state(false), busy=$state(false), reveal=$state(false), confirming=$state(false);
  let message=$state(''), conflict=$state(false);
  function refresh() {
    const vault=browserVault();
    pairing=vault.pairing; dirty=!!pairing && pairing.syncedRevision!==vault.syncRevision;
    message=syncMessage; conflict=hasConflict;
    if (!pairing) reveal=false;
  }
  onMount(()=>{
    refresh();
    window.addEventListener('lacuna:journal-changed',refresh);
    window.addEventListener('lacuna:sync-status',refresh);
    return ()=>{
      window.removeEventListener('lacuna:journal-changed',refresh);
      window.removeEventListener('lacuna:sync-status',refresh);
    };
  });
  async function run(action:()=>Promise<void>) {
    if (busy) return;
    busy=true;
    try {await action();refresh();}
    catch (e) {refresh();message=e instanceof Error?e.message:'Could not change sync.';}
    finally {busy=false;}
  }
  async function toggle() {
    await pauseSyncWork();
    const vault=browserVault(),previous=vault.pairing;
    const next=previous?{...previous,enabled:!previous.enabled}:{code:newPairingCode(),version:0,syncedRevision:-1,syncedPages:0,enabled:true};
    await vault.setPairing(previous,next);
    if (!previous) reveal=true;
    if (next.enabled) await runBrowserSync();
  }
</script>
<section aria-labelledby="sync-title">
  <h3 id="sync-title">Sync across devices</h3>
  <p>Your journal stays on this device until you enable sync. Only an encrypted copy goes online. Pair another device with your private code and journal passphrase.</p>
  <button disabled={busy} onclick={()=>run(toggle)}>{pairing?.enabled?'Pause sync on this device':pairing?'Resume sync':'Enable encrypted sync'}</button>
  {#if pairing}
    <p role="status">{pairing.enabled?(dirty?'Local changes waiting to sync.':'This device is synced.'):'Sync paused on this device.'}</p>
    <button disabled={busy} aria-expanded={reveal} onclick={()=>reveal=!reveal}>{reveal?'Hide pairing code':'Show pairing code'}</button>
    {#if reveal}
      <label>Private pairing code<input readonly value={pairing.code} onclick={e=>e.currentTarget.select()} /></label>
      <p>Keep this code in your password manager. On the other device, open the journal passphrase screen and choose “Link a synced journal”. Anyone with the code can remove the online copy. Reading it also requires your passphrase.</p>
    {/if}
    {#if pairing.enabled}
      <button disabled={busy} onclick={()=>run(()=>runBrowserSync())}>Sync now</button>
      {#if conflict}<button disabled={busy} onclick={()=>run(()=>runBrowserSync(true))}>Back up this device and use online copy</button>{/if}
    {/if}
    <button disabled={busy} onclick={()=>{if(!confirming){confirming=true;return;}void run(async()=>{await pauseSyncWork();await removeOnline(browserVault());confirming=false;});}}>{confirming?'Confirm deletion of online copy':'Delete online copy'}</button>
    {#if confirming}<p>This removes the active online copy for all paired devices. Their local journals stay intact. Encrypted database backups expire separately.</p><button disabled={busy} onclick={()=>confirming=false}>Cancel</button>{/if}
  {/if}
  {#if message}<p role="status">{message}</p>{/if}
</section>
<style>
  section{display:grid;gap:.85rem}h3{font:400 1.35rem var(--font)}
  p,label{color:var(--ink-muted)}input{display:block;width:100%;font:1rem monospace;padding:.55rem;margin-top:.35rem}
  button{justify-self:start;background:none;border:0;color:var(--ink);font:inherit;cursor:pointer;padding:.45rem 0;text-align:left;text-decoration:underline;text-underline-offset:.23em}button:disabled{opacity:.5}
</style>
