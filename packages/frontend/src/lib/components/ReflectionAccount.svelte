<script lang="ts">
  import { onMount } from 'svelte';
  import { hosted,reflectionStatus,type Account } from '$lib/reflection-service.js';
  import { browserVault, announceBrowserLock } from '$lib/web-vault.js';
  let {billingReturn=$bindable('')}:{billingReturn?:string}=$props();
  let account=$state<Account|null>(null), email=$state(''),code=$state(''),sent=$state(false),busy=$state(false),error=$state(''),enabled=$state(false);
  let mounted=false, progress=$state(''), online=$state(true), loaded=$state(false), delayed=$state(false), notice=$state('');
  let paymentIssue=$derived(['past_due','unpaid','incomplete','paused'].includes(account?.billingState??''));
  async function refresh(){
    try{const fresh=await hosted<Account>('account');if(!mounted)return;account=fresh;sync();
      if(fresh.paid || ['past_due','unpaid','incomplete','paused'].includes(fresh.billingState))billingReturn='';
    }catch(e){if((e as {status?:number}).status!==401)throw e;account=null;enabled=false;}
    loaded=true;
  }
  async function run(fn:()=>Promise<void>){if(busy)return;busy=true;error='';notice='';try{await fn();}catch(e){if(mounted)error=e instanceof Error?e.message:'Please try again.';}finally{busy=false;}}
  function sync(){
    const vault=browserVault(), local=vault.unlocked?vault.read().reflectionConsent:undefined;
    enabled=!!local && local.account===account?.id && local.epoch===account?.consent;
  }
  onMount(()=>{
    mounted=true;online=navigator.onLine;
    if(online)void run(refresh);
    const connection=()=>{online=navigator.onLine;if(online)void run(refresh);};
    window.addEventListener('online',connection);
    window.addEventListener('offline',connection);
    const status=()=>{progress=reflectionStatus();};status();
    window.addEventListener('lacuna:reflection-status',status);
    const wait=setTimeout(()=>{delayed=true;},45000);
    let ticks=0;
    const timer=setInterval(async()=>{
      ticks++;
      if(online && account && !document.hidden && (ticks%12===0 || (billingReturn==='returned' && !account.paid && !delayed)))await run(refresh);
    },5000);
    return ()=>{mounted=false;clearInterval(timer);clearTimeout(wait);window.removeEventListener('online',connection);window.removeEventListener('offline',connection);window.removeEventListener('lacuna:reflection-status',status);};
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
  <div role="status" aria-atomic="true">
    {#if !online}<p>Offline. Your journal and saved memoir are available. Reconnect to use billing and generate reflections.</p>
    {:else if !loaded && !error}<p>Checking your reflection account…</p>
    {:else if billingReturn==='returned' && account && !account.paid}<p>{delayed?'Still waiting for payment confirmation. Check billing status before starting another purchase.':'Waiting for Stripe to confirm your subscription…'}</p>
    {:else if billingReturn==='cancelled'}<p>Checkout closed. You can return to it at any time.</p>
    {:else if enabled && account?.paid}<p>{progress || 'Reflections are enabled for this journal.'}</p>{/if}
  </div>
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if !account?.paid && online && loaded}<p class="note">Monthly allowances apply to your account and to Lacuna as a whole. If either runs out, new reflections pause until the next calendar month (UTC). Your journal and saved book stay available.</p>{/if}
  {#if !loaded}
    {#if online && error}<button class="atlas-link" disabled={busy} onclick={()=>run(refresh)}>Retry account check</button>{/if}
  {:else if !account && online}
    <p>CA$5 per month adds a Soul Map and a memoir written from your pages. Applicable tax is shown at checkout. Writing, encrypted sync and reading your saved book stay free.</p>
    <form onsubmit={e=>{e.preventDefault();void run(signIn);}}>
      <div class="field"><label for="billing-email">Email</label><input id="billing-email" required type="email" autocomplete="email" bind:value={email} disabled={sent}/></div>
      {#if sent}<div class="field"><label for="billing-code">Code from your email</label><input id="billing-code" required maxlength="12" autocomplete="one-time-code" bind:value={code}/><p class="note">Codes expire after ten minutes. Use the latest email.</p></div>{/if}
      <button class="atlas-primary" disabled={busy}>{sent?'Sign in':'Email a sign-in code'}</button>
      {#if sent}<button class="atlas-link" type="button" disabled={busy} onclick={()=>run(async()=>{await hosted('login',{email});code='';notice='A new code has been sent.';})}>Send a new code</button><button class="atlas-link" type="button" disabled={busy} onclick={()=>{sent=false;code='';error='';notice='';}}>Change email</button>{/if}
    </form>
  {:else if account && online}
    <p class="note">{account.email}</p>
    {#if account.paid}
      {#if account.billingState==='ending'}<p>Your subscription ends on {new Date(account.paidUntil*1000).toLocaleDateString()}. Your saved memoir stays available.</p>{/if}
      <p>With your permission, Lacuna sends excerpts from past and future pages to OpenAI while this journal is unlocked. Your book is saved here.</p>
      {#if !enabled}<p>Reflections are paused on this journal.</p>{/if}
      <button class="atlas-link" disabled={busy} onclick={()=>run(()=>share(!enabled))}>{enabled?'Pause reflections':'Allow reflections on this journal'}</button>
    {:else}
      {#if paymentIssue}<p>Your subscription needs attention. Open Manage billing to check the payment.</p>
      {:else if billingReturn==='returned'}<button class="atlas-link" disabled={busy} onclick={()=>run(refresh)}>Check billing status</button>
      {:else}
        {#if account.billingState==='canceled' || account.billingState==='ending'}<p>Your subscription has ended. You can still read your saved book.</p>{/if}
        <p>CA$5 per month for new readings and memoir passages. Review applicable tax at checkout. You can cancel in Manage billing.</p>
        <button class="atlas-link" disabled={busy} onclick={()=>run(()=>checkout('checkout'))}>View subscription</button>
      {/if}
      {#if enabled}<button class="atlas-link" disabled={busy} onclick={()=>run(()=>share(false))}>Withdraw journal consent</button>{/if}
    {/if}
    {#if account.customer}<button class="atlas-link" disabled={busy} onclick={()=>run(()=>checkout('portal'))}>Manage billing</button>{/if}
    <button class="atlas-link" disabled={busy} onclick={()=>run(async()=>{await browserVault().update(d=>{delete d.reflectionConsent;});announceBrowserLock();await hosted('logout',{});account=null;enabled=false;sent=false;})}>Sign out of billing account</button>
  {/if}
  <div role="alert">{#if error}<p class="error">{error}</p>{/if}</div>
</div>
<style>
  .membership,form{display:grid;gap:var(--space-4);justify-items:start}
  .field{justify-self:stretch}
  .error{color:var(--danger)}
</style>
