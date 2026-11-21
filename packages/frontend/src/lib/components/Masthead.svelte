<script lang="ts">
  import type { Snippet } from 'svelte';
  import MusicButton from './MusicButton.svelte';
  let { children }: {children?: Snippet} = $props();
</script>

<header class="masthead">
  <div class="wrap masthead-content">
    <div class="signature"><span aria-hidden="true">≈</span>Lacuna <MusicButton/></div>
    <nav aria-label="Main navigation">{@render children?.()}</nav>
  </div>
</header>

<style>
  .masthead{height:var(--mast-height);background:var(--paper);border-bottom:1px solid var(--line);color:var(--ink)}
  .masthead-content{height:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding-inline:var(--gutter)}
  .signature{display:flex;align-items:center;gap:.45rem;letter-spacing:-.065em;font:500 1.85rem/1 var(--font-reading);white-space:nowrap}
  .signature span{font:italic bold 2rem/.8 Georgia,serif;color:var(--river)}
  nav{display:flex;align-items:center;gap:clamp(.35rem,1.4vw,1.5rem);min-width:0}
  nav :global(:is(button,a)){display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:.25rem .4rem;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--muted);font:500 .87rem/1.15 var(--font-ui);text-decoration:none;cursor:pointer}
  nav :global([aria-current="page"]){color:var(--ink);border-bottom-color:var(--river)}
  nav :global(:is(button,a):hover){color:var(--river)}
  @media(max-width:520px){.signature{font-size:1.4rem;gap:3px}.signature span{font-size:1.4rem}nav{gap:0}nav :global(:is(button,a)){font-size:.78rem;padding-inline:.35rem}}
</style>
