<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import MusicButton from './MusicButton.svelte';
  let { children, heading, floating=false, disabled=false }: {children?: Snippet; heading?:Snippet; floating?:boolean; disabled?:boolean} = $props();
  const menuId=$props.id();
  let trigger:HTMLButtonElement, sheet:HTMLElement;
  let supported=$state(false);
  onMount(async()=>{
    if(!('popover' in HTMLElement.prototype))await import('@oddbird/popover-polyfill');
    supported=true;
  });
  function choose(event:MouseEvent){
    if(!(event.target instanceof Element) || !event.target.closest('button:enabled,a[href]'))return;
    sheet.hidePopover();
    trigger.focus({preventScroll:true});
  }
</script>

<header class="masthead" class:floating>
  <span class="signature">Lacuna</span>
  <button class="trigger" bind:this={trigger} popovertarget={menuId} disabled={disabled||!supported}>Menu</button>
  <nav id={menuId} popover="auto" bind:this={sheet} aria-label="Lacuna menu" onclickcapture={choose}>
    <div class="sheet-head">{#if heading}{@render heading()}{:else}<strong>Lacuna</strong>{/if}<button aria-label="Close menu" popovertarget={menuId} popovertargetaction="hide">×</button></div>
    {@render children?.()}
    <MusicButton opener={()=>trigger}/>
  </nav>
</header>

<style>
  .masthead{height:var(--mast-height);padding-inline:var(--gutter);display:flex;align-items:center;justify-content:space-between;color:var(--ink);background:var(--paper)}
  .floating{position:absolute;inset:0 0 auto;z-index:2;pointer-events:none;background:linear-gradient(#142f2b80,transparent);color:#fff6df}
  .signature{font:500 1.85rem/1 var(--font-reading);letter-spacing:-.065em}.floating .signature{text-shadow:0 1px 6px #102820}
  .trigger{pointer-events:auto;border:1px solid #717d6b80;background:#f6f1e4;color:#223c33;border-radius:4px;min-height:44px;padding:0 1.1rem;font:500 .94rem var(--font-ui);cursor:pointer}
  .floating .trigger{background:#19352eef;color:#fff5df;border-color:#f3e6c770}
  nav{display:none;pointer-events:auto;position:fixed;inset:calc(var(--mast-height) - 4px) var(--gutter) auto auto;margin:0;width:min(19rem,calc(100vw - 2rem));max-height:calc(100dvh - var(--mast-height) - 1rem);box-sizing:border-box;overflow:auto;overscroll-behavior:contain;border:1px solid #bac1af;border-radius:5px;background:#f7f3e6;color:#263f35;padding:.45rem .95rem;box-shadow:0 12px 40px #10281f38}
  nav:is(:popover-open,:global(.\:popover-open)){display:grid}.sheet-head{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #c7cbbb;margin-bottom:.25rem}
  .sheet-head strong{font:500 1.45rem var(--font-reading);letter-spacing:-.045em}
  nav :global(:is(button,a)){background:none;border:0;border-radius:2px;min-height:44px;width:100%;padding:.45rem .35rem;text-align:left;align-content:center;color:inherit;text-decoration:none;font:500 .93rem/1.25 var(--font-ui);cursor:pointer}
  nav :global(:is(button,a):hover),nav :global([aria-current=page]){background:#e6e8da}
  nav :global(button:disabled){opacity:.5;cursor:default}
  .sheet-head button{flex:none;width:44px;text-align:center;font-size:1.4rem}
  @media(max-width:600px){nav{inset:auto 0 0;width:100%;max-height:85dvh;border-radius:12px 12px 0 0;padding:.65rem var(--gutter) max(.8rem,env(safe-area-inset-bottom))}nav::backdrop{background:#132d3240}}
</style>
