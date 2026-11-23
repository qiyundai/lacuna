<script lang="ts">
  import { onMount } from 'svelte';
  import { hosted,reflectionStatus,type Account } from '$lib/reflection-service.js';
  import { browserVault, announceBrowserLock } from '$lib/web-vault.js';
  let account=$state<Account|null>(null), email=$state(''),code=$state(''),sent=$state(false),busy=$state(false),error=$state(''),enabled=$state(false);
  let mounted=false, progress=$state('');
  async function run(fn:()=>Promise<void>){if(busy)return;busy=true;error='';try{await fn();}catch(e){if(mounted)error=e instanceof Error?e.message:'Please try again.';}finally{busy=false;}}
  function sync(){
    const vault=browserVault(), local=vault.unlocked?vault.read().reflectionConsent:undefined;
    enabled=!!local && local.account===account?.id && local.epoch===account?.consent;
  }
  onMount(()=>{
    mounted=true;void run(async()=>{try{account=await hosted<Account>('account');sync();}catch(e){if((e as {status?:number}).status!==401)throw e;}});
    const status=()=>{progress=reflectionStatus();};status();
    window.addEventListener('lacuna:reflection-status',status);
    let checking=false;
    const timer=setInterval(async()=>{
      if(!account?.customer || account.paid || busy || checking)return;
      checking=true;
      try{const updated=await hosted<Account>('account');if(mounted && updated.id===account?.id){account=updated;sync();}}
      catch{}finally{checking=false;}
    },5000);
    return ()=>{mounted=false;clearInterval(timer);window.removeEventListener('lacuna:reflection-status',status);};
  });
  async function signIn(){
    if(sent){account=await hosted<Account>('verify',{email,code:code.trim()});code='';sync();}
    else{await hosted('login',{email});sent=true;}
  }
  async function share(allow:boolean){
    const vault=browserVault(),generation=vault.sessionGeneration;
    if(!allow){await vault.update(d=>{delete d.reflectionConsent;});enabled=false;announceBrowserLock();}
    const fresh=await hosted<Account>('consent',{enabled:allow});
    if(generation!==vault.sessionGeneration || !mounted)return;
    account=fresh;
    if(allow)await vault.update(d=>{d.reflectionConsent={account:fresh.id,epoch:fresh.consent};});
    sync();
  }
  async function checkout(path:string){
    const {url}=await hosted<{url:string}>(path,{});
    const target=new URL(url);
    if(target.protocol!=='https:' || !['checkout.stripe.com','billing.stripe.com'].includes(target.hostname))throw new Error('Billing could not open.');
    location.assign(target.href);
  }
</script>
<div class="membership">
  {#if !account}
    <p>A subscription adds a Soul Map and a memoir written from your pages. Writing and reading your existing book stay free.</p>
    <form onsubmit={e=>{e.preventDefault();void run(signIn);}}>
      <div class="field"><label for="billing-email">Email</label><input id="billing-email" required type="email" autocomplete="email" bind:value={email} disabled={sent}/></div>
      {#if sent}<div class="field"><label for="billing-code">Code from your email</label><input id="billing-code" required maxlength="12" autocomplete="one-time-code" bind:value={code}/></div>{/if}
      <button class="atlas-primary" disabled={busy}>{sent?'Sign in':'Email a sign-in code'}</button>
      {#if sent}<button class="atlas-link" type="button" disabled={busy} onclick={()=>{sent=false;code='';}}>Change email</button>{/if}
    </form>
  {:else}
    <p class="note">{account.email}</p>
    {#if account.paid}
      <p>With your permission, Lacuna sends excerpts from past and future pages to OpenAI while this journal is unlocked. Your book is saved here.</p>
      <button class="atlas-link" disabled={busy} onclick={()=>run(()=>share(!enabled))}>{enabled?'Pause reflections':'Allow reflections on this journal'}</button>
    {:else}
      <p>A subscription adds new readings and memoir passages. You can review the price at checkout.</p>
      <button class="atlas-link" disabled={busy} onclick={()=>run(()=>checkout('checkout'))}>View subscription</button>
      {#if enabled}<button class="atlas-link" disabled={busy} onclick={()=>run(()=>share(false))}>Withdraw journal consent</button>{/if}
    {/if}
    {#if account.customer}<button class="atlas-link" disabled={busy} onclick={()=>run(()=>checkout('portal'))}>Manage billing</button>{/if}
    <button class="atlas-link" disabled={busy} onclick={()=>run(async()=>{await browserVault().update(d=>{delete d.reflectionConsent;});announceBrowserLock();await hosted('logout',{});account=null;enabled=false;sent=false;})}>Sign out of billing account</button>
  {/if}
  {#if error}<p role="alert" class="error">{error}</p>{/if}
  {#if enabled && progress}<p role="status">{progress}</p>{/if}
</div>
<style>
  .membership,form{display:grid;gap:var(--space-4);justify-items:start}
  .field{justify-self:stretch}
  .error{color:var(--danger)}
</style>
