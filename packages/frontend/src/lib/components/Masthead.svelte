<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import MusicButton from './MusicButton.svelte';
  import SoundToggle from './SoundToggle.svelte';
  import IconAction from './IconAction.svelte';
  import InfoOverlay from './InfoOverlay.svelte';
  /*
   * Top bar: signature on the left, controls on the right.
   *   children — menu items (scene actions, navigation, exits)
   *   sound    — sound toggles, grouped at the end of the menu with Music
   *   audio    — show the master sound switch beside the menu button
   */
  let { children, sound, world, pageCount=0, floating=false, unread=false, disabled=false, audio=false, journalMenu=false, showSignature=true }: {
    children?:Snippet; sound?:Snippet; world?:string; pageCount?:number; floating?:boolean; disabled?:boolean; audio?:boolean
    journalMenu?:boolean; showSignature?:boolean; unread?:boolean
  } = $props();
  const menuId=$props.id();
  const calendar=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'});
  const clock=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
  let trigger:HTMLButtonElement, sheet:HTMLElement;
  let supported=$state(false), open=$state(false), now=$state(new Date());
  let showInfo=$state(false);
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
    if(event.target.closest('[aria-pressed]'))return;
    sheet.hidePopover();
    trigger.focus({preventScroll:true});
  }
</script>

<header class="masthead" class:floating class:with-details={open && !!world}>
  {#if showSignature}<span class="signature">Lacuna</span>{/if}
  <div class="launcher captions-below">
    {#if world && open}
      <div class="world">
        <div><strong>{world}</strong><span class="meta">{pageCount} {pageCount===1?'page':'pages'}</span></div>
        <time class="meta" datetime={now.toISOString()}>{calendar.format(now)} <span aria-hidden="true">·</span> {clock.format(now)}</time>
      </div>
    {/if}
    {#if audio}<SoundToggle/>{/if}
    <button type="button" class="scene-control solid trigger" class:raised={open} bind:this={trigger} popovertarget={menuId} aria-label={open?'Close menu':'Menu'} aria-describedby={unread && !open?menuId+'-unread':undefined} aria-expanded={open} disabled={disabled||!supported}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true">
        <path class="top" d="M4 6h16"/><path class="middle" d="M4 12h16"/><path class="base" d="M4 18h16"/>
      </svg>
      {#if unread && !open}<i class="unread-postcard" aria-hidden="true"></i><span class="visually-hidden" id={menuId+'-unread'}>Unread postcard</span>{/if}
      {#if !open}<span class="scene-caption" aria-hidden="true">Menu</span>{/if}
    </button>
  </div>
  <nav id={menuId} popover="auto" bind:this={sheet} aria-label="Lacuna menu" onclickcapture={choose} ontoggle={e=>open=e.newState==='open'}>
    {@render children?.()}
    {#if journalMenu}
      <IconAction icon="info" label="About Lacuna" onclick={()=>showInfo=true}/>
      <IconAction icon="privacy" label="Privacy" href="/privacy"/>
      <IconAction icon="terms" label="Terms of Service" href="/terms"/>
    {/if}
    <span class="group-break" aria-hidden="true"></span>
    {@render sound?.()}
    <MusicButton opener={()=>trigger}/>
  </nav>
</header>
{#if journalMenu}<InfoOverlay bind:show={showInfo}/>{/if}

<style>
  .masthead{height:var(--mast-height);padding-inline:var(--gutter);display:flex;align-items:center;justify-content:space-between;color:var(--ink);background:var(--paper)}
  .floating{position:absolute;inset:0 0 auto;z-index:var(--z-chrome);pointer-events:none;background:var(--scene-scrim);color:var(--scene-ink)}
  .signature{font:400 var(--text-signature)/1 var(--font);letter-spacing:var(--ls-hero)}.floating .signature{text-shadow:0 1px 6px var(--scene-shade)}
  .launcher{position:relative;display:flex;align-items:center;gap:var(--control-gap);margin-inline-start:auto}


  .trigger svg{inline-size:var(--icon);block-size:var(--icon);stroke-width:1.7}
  .trigger[aria-expanded=true] .top{transform:translateY(6px) rotate(45deg)}
  .trigger[aria-expanded=true] .middle{opacity:0}
  .trigger[aria-expanded=true] .base{transform:translateY(-6px) rotate(-45deg)}
  .trigger path{transform-box:fill-box;transform-origin:center}
  /* On paper there is no scene to wash over: controls go solid and captions use ink */
  .masthead:not(.floating) :global(.scene-control:not(.raised)){background:var(--scene-control)}
  .masthead:not(.floating) :global(.scene-control:not(.raised):is(:enabled,a):hover){background:var(--scene-control-hover)}
  .masthead:not(.floating) :global(.scene-control:focus-visible){outline-color:var(--focus)}
  .masthead:not(.floating) :global(.scene-control > svg){filter:none}
  .masthead:not(.floating) :global(.scene-caption){color:var(--ink);text-shadow:none}

  .world{position:absolute;right:calc(100% + var(--space-2));width:max-content;max-width:calc(100vw - 2 * var(--gutter) - 2 * var(--control) - var(--control-gap) - var(--space-2));padding:3px var(--space-2);text-align:right;color:var(--scene-ink);text-shadow:var(--scene-type-shadow);pointer-events:none}
  .world div{display:flex;gap:var(--space-2);align-items:baseline;justify-content:flex-end}
  .world strong{font:400 var(--ui-lg)/1.2 var(--font);letter-spacing:var(--ls-heading)}
  .meta{font:400 var(--ui-xs)/1.25 var(--font);color:var(--scene-ink-muted)}
  time{display:block;font-variant-numeric:tabular-nums}time span{padding:0 .15rem}

  /* The menu hangs from the trigger: same right edge, one gap below it */
  nav{display:none;position:fixed;inset:calc(var(--mast-height) / 2 + var(--control) / 2) calc(var(--gutter) - var(--space-2)) auto auto;margin:0;box-sizing:border-box;width:min(14rem,calc(100vw - var(--gutter)));max-height:calc(100dvh - var(--mast-height) - 68px - env(safe-area-inset-bottom));padding:var(--space-2);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;pointer-events:none;border:0;background:transparent;color:inherit}
  nav:is(:popover-open,:global(.\:popover-open)){display:grid;justify-items:end;gap:var(--control-gap)}
  nav::backdrop{background:transparent}
  .group-break{block-size:var(--space-2)}
  @media(max-width:410px){.with-details .signature{visibility:hidden}}
  @media(prefers-reduced-motion:no-preference){
    .trigger path{transition:transform var(--dur-fast) var(--ease-soft),opacity var(--dur-micro) var(--ease-soft)}
    .world{animation:slide-left .24s var(--ease-out) both}
    nav > :global(.scene-control){animation:lower .24s var(--ease-out) backwards}
    nav > :global(:nth-child(2)){animation-delay:24ms}nav > :global(:nth-child(3)){animation-delay:48ms}
    nav > :global(:nth-child(4)){animation-delay:72ms}nav > :global(:nth-child(n+5)){animation-delay:96ms}
    @keyframes slide-left{from{opacity:0;transform:translateX(20px)}}
    @keyframes lower{from{opacity:0;transform:translateY(-22px)}}
  }
</style>
