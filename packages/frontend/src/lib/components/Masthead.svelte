<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import MusicButton from './MusicButton.svelte';
  let { children, quick, world, pageCount=0, floating=false, disabled=false }: {
    children?:Snippet; quick?:Snippet; world?:string; pageCount?:number; floating?:boolean; disabled?:boolean
  } = $props();
  const menuId=$props.id();
  const calendar=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'});
  const clock=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
  let trigger:HTMLButtonElement, sheet:HTMLElement;
  let supported=$state(false), open=$state(false), now=$state(new Date());
  onMount(async()=>{
    if(!('popover' in HTMLElement.prototype))await import('@oddbird/popover-polyfill');
    supported=true;
  });
  $effect(()=>{
    if(!open || !world)return;
    let timer:ReturnType<typeof setTimeout>;
    function update(){
      now=new Date();
      timer=setTimeout(update,60000-Date.now()%60000);
    }
    update();
    return ()=>clearTimeout(timer);
  });
  function choose(event:MouseEvent){
    if(!(event.target instanceof Element) || !event.target.closest('button:enabled,a[href]'))return;
    sheet.hidePopover();
    trigger.focus({preventScroll:true});
  }
</script>

<header class="masthead" class:floating class:with-details={open && !!world}>
  <span class="signature">Lacuna</span>
  <div class="launcher" class:paired={!!quick}>
    {#if world && open}
      <div class="world">
        <div><strong>{world}</strong><span class="pages">{pageCount} {pageCount===1?'page':'pages'}</span></div>
        <time datetime={now.toISOString()}>{calendar.format(now)} <span aria-hidden="true">·</span> {clock.format(now)}</time>
      </div>
    {/if}
    {@render quick?.()}
    <button type="button" class="trigger" bind:this={trigger} popovertarget={menuId} aria-label={open?'Close menu':'Menu'} aria-expanded={open} disabled={disabled||!supported}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
        <path class="top" d="M4 6h16"/><path class="middle" d="M4 12h16"/><path class="base" d="M4 18h16"/>
      </svg>
      <span class="hint" aria-hidden="true">{open?'Close menu':'Menu'}</span>
    </button>
  </div>
  <nav id={menuId} popover="auto" bind:this={sheet} aria-label="Lacuna menu" onclickcapture={choose} ontoggle={e=>open=e.newState==='open'}>
    {@render children?.()}
    <MusicButton opener={()=>trigger}/>
  </nav>
</header>

<style>
  .masthead{height:var(--mast-height);padding-inline:var(--gutter);display:flex;align-items:center;justify-content:space-between;color:var(--ink);background:var(--paper)}
  .floating{position:absolute;inset:0 0 auto;z-index:2;pointer-events:none;background:linear-gradient(#142f2b80,transparent);color:#fff6df}
  .signature{font:500 1.85rem/1 var(--font-reading);letter-spacing:-.065em}.floating .signature{text-shadow:0 1px 6px #102820}
  .launcher{position:relative;display:flex;align-items:center}
  .paired{gap:.35rem}.paired .trigger .hint{top:calc(100% + 3px);right:0}
  .trigger{width:46px;height:46px;position:relative;pointer-events:auto;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:#24463cd9;color:var(--scene-ink);cursor:pointer}
  .trigger:hover,.trigger:focus-visible{background:var(--river)}
  .trigger:focus-visible{outline:2px solid #e2bd7a;outline-offset:2px}
  .trigger[aria-expanded=true]{background:#f3e7c5;color:#294935}
  .trigger[aria-expanded=true] .top{transform:translateY(6px) rotate(45deg)}
  .trigger[aria-expanded=true] .middle{opacity:0}
  .trigger[aria-expanded=true] .base{transform:translateY(-6px) rotate(-45deg)}
  .trigger path{transform-box:fill-box;transform-origin:center}
  .hint,.world{position:absolute;right:calc(100% + 9px);width:max-content;max-width:calc(100vw - 46px - 2 * var(--gutter) - 10px);color:var(--scene-ink);text-shadow:var(--scene-type-shadow);pointer-events:none}
  .hint{opacity:0;border-radius:5px;padding:.34rem .6rem;font:500 .83rem/1.25 var(--font-ui)}
  .trigger:focus-visible .hint{opacity:1}
  @media(hover:hover){.trigger:hover .hint{opacity:1}}
  .trigger[aria-expanded=true] .hint{top:calc(100% + 3px)}
  .world{padding:3px .4rem;text-align:right}
  .masthead:not(.floating) .hint{color:var(--ink);text-shadow:none}
  .world div{display:flex;gap:.65rem;align-items:baseline;justify-content:flex-end}
  .world strong{font:400 1.24rem/1.15 var(--font-reading);letter-spacing:-.035em}
  .world .pages,.world time{font:500 .76rem/1.25 var(--font-ui);color:#eee2c4}.world time{display:block;font-variant-numeric:tabular-nums}.world time span{padding:0 .15rem}
  nav{display:none;position:fixed;inset:calc(var(--mast-height) / 2 + 23px) calc(var(--gutter) - 5px) auto auto;margin:0;box-sizing:border-box;width:min(14rem,calc(100vw - var(--gutter)));max-height:calc(100dvh - var(--mast-height) - 68px - env(safe-area-inset-bottom));padding:8px 6px 6px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;pointer-events:none;border:0;background:transparent;color:inherit}
  nav:is(:popover-open,:global(.\:popover-open)){display:grid;justify-items:end;gap:var(--space-2)}
  nav::backdrop{background:transparent}
  @media(max-width:410px){.with-details .signature{visibility:hidden}}
  @media(prefers-reduced-motion:no-preference){
    .trigger path,.hint{transition:transform .2s,opacity .15s}
    .world{animation:slide-left .24s cubic-bezier(.16,1,.3,1) both}
    nav > :global(.icon-action){animation:lower .24s cubic-bezier(.16,1,.3,1) backwards}
    nav > :global(:nth-child(2)){animation-delay:24ms}nav > :global(:nth-child(3)){animation-delay:48ms}
    nav > :global(:nth-child(4)){animation-delay:72ms}nav > :global(:nth-child(n+5)){animation-delay:96ms}
    @keyframes slide-left{from{opacity:0;transform:translateX(20px)}}
    @keyframes lower{from{opacity:0;transform:translateY(-22px)}}
  }
</style>
