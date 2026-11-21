<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import Masthead from './Masthead.svelte';
  import JournalCity from './JournalCity.svelte';
  import CorridorFlight from './CorridorFlight.svelte';
  let {action,children}:{action:string;children:Snippet}=$props();
  let opened=$state(false),walking=$state(false);
  let controls=$state<HTMLElement>(),start=$state<HTMLButtonElement>(),walkButton=$state<HTMLButtonElement>();
  async function open(){
    opened=true;await tick();
    controls?.querySelector<HTMLElement>('h1,input,button')?.focus({preventScroll:true});
  }
  async function back(){opened=false;await tick();start?.focus();}
  async function leave(){walking=false;await tick();walkButton?.focus();}
</script>
<div class="welcome" class:menu={!walking}>
  <Masthead><a href="/privacy">Privacy</a></Masthead>
  {#if walking}<JournalCity guest onExit={leave}/>
  {:else}
    <main class="arrival">
      <section class="river-view" aria-label="The valley city">
      <CorridorFlight/>
      {#if opened}
        <div class="leaf" bind:this={controls}><button class="atlas-link" onclick={back}>← Back to the valley</button>{@render children()}</div>
      {:else}
        <div class="intro">
          <h1>The valley city</h1>
          <p>A private journal that grows a city, one page at a time.</p>
          <div class="links"><button class="begin" bind:this={start} onclick={open}>{action}</button>
          <button class="visit" bind:this={walkButton} onclick={()=>walking=true}>Visit the example city <span aria-hidden="true">↗</span></button></div>
        </div>
      {/if}
      </section>
    </main>
  {/if}
</div>
<style>
  .welcome{height:100%;display:grid;grid-template-rows:var(--mast-height) minmax(0,1fr)}
  .welcome.menu{position:relative;display:block}
  .menu :global(.masthead){position:absolute;inset:0 0 auto;z-index:2;color:#fff3d9;background:linear-gradient(#102520c9,transparent);border:0}
  .menu :global(.signature span),.menu :global(.masthead nav a){color:#f3edd8}
  .menu .arrival{height:100%}
  .arrival{overflow:auto;color:#fff6db;background:#4f6759}.river-view{position:relative;isolation:isolate;min-height:100%;display:flex;align-items:safe end;padding:clamp(22px,6.5vw,110px) var(--gutter)}
  .river-view{padding-top:calc(var(--mast-height) + 55px)}
  .river-view:before{position:absolute;inset:0;content:'';z-index:-1;background:linear-gradient(90deg,#152a2480,transparent 65%),linear-gradient(0deg,#10241ee8,transparent 64%);pointer-events:none}
  .intro{padding-bottom:min(3vh,30px);max-width:38rem}
  h1{margin:0 0 .8rem;font:400 clamp(4.4rem,8.7vw,9.8rem)/.96 var(--font-reading);letter-spacing:-.065em}
  .intro p{max-width:28ch;font:400 clamp(1.25rem,2vw,1.75rem)/1.4 var(--font-reading)}
  .links{display:flex;gap:12px;flex-wrap:wrap;margin-top:1.8rem}.links button{min-height:48px;padding:10px 22px;font:600 .96rem/1.2 var(--font-ui);border-radius:4px;cursor:pointer}
  .begin{color:#273c34;background:#f7f1da;border:1px solid #f7f1da}.visit{color:#fff6db;background:#273544cb;border:1px solid #e8e2c7a8}.visit span{margin-left:8px}
  .leaf{align-self:safe center;width:min(100%,30rem);border:1px solid #b8aa8d;background:#f8f3e4;color:var(--ink);padding:clamp(20px,3vw,44px);border-radius:6px}
  .leaf>.atlas-link{margin-bottom:12px}@media(max-width:550px){.intro{padding-bottom:3vh}}
</style>
