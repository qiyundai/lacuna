<script module lang="ts">
  const drawings = {
    pages: 'M7 3.5h11a1.5 1.5 0 0 1 1.5 1.5v13H8a2 2 0 0 0 0 4h11.5M6 20V5a1.5 1.5 0 0 1 1.5-1.5M10 8h6M10 11h4',
    city: 'M2 20h20M4 20V9l4-3 4 3v11m0-8h7v8M7 11v2m2 3v3m6-4v2',
    overlook: 'm2 18 7-11 5 8 3-5 5 8H2Zm4.5-7 2.5 2 2.3-2',
    pause: 'M8 5v14M16 5v14',
    play: 'm7 4 12 8-12 8Z',
    town: 'm3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7',
    journal: 'M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v14',
    quiet: 'M4 21 17 8M6 18c-1-7 3-14 14-15 .5 8-3 14-9 14H7',
    settings: 'M4 6h8m5 0h3M4 12h2m5 0h9M4 18h9m5 0h2M12 4v4M7 10v4M14 16v4',
    privacy: 'M12 2.8 20 6v5c0 5-3.4 8.4-8 11-4.6-2.6-8-6-8-11V6ZM8.5 12l2.5 2.5 4.8-5',
    leave: 'M10 4H4v16h6m-1-8h12m-5-5 5 5-5 5',
    back: 'M20 12H4m7-7-7 7 7 7',
    music: 'M9 17V6l11-2v11M9 9l11-2M9 17a3.2 2.5 0 1 1-6.4 0 3.2 2.5 0 1 1 6.4 0Zm11-2a3.2 2.5 0 1 1-6.4 0 3.2 2.5 0 1 1 6.4 0Z',
    write: 'm4 16 12-12a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L8 20l-5 1 1-5Zm10-10 4 4M4 16l4 4',
    retry: 'M20 10a8 8 0 1 0-1 7M20 4v6h-6'
  } as const;
</script>
<script lang="ts">
  let {icon,label,href,onclick,disabled=false,current,controls,expanded,primary=false}:{
    icon:keyof typeof drawings; label:string; href?:string; onclick?:()=>void; disabled?:boolean;
    current?:'page'; controls?:string; expanded?:boolean; primary?:boolean
  }=$props();
</script>

{#snippet face()}
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={drawings[icon]}/></svg>
  <span class="caption" aria-hidden="true">{label}</span>
{/snippet}
{#if href}
  <a class="icon-action" {href} aria-label={label} aria-current={current}>{@render face()}</a>
{:else}
  <button type="button" class="icon-action" class:primary {onclick} {disabled} aria-label={label} aria-current={current} aria-controls={controls} aria-expanded={expanded}>{@render face()}</button>
{/if}

<style>
  .icon-action{position:relative;display:grid;place-items:center;flex:none;width:44px;height:44px;padding:0;border-radius:50%;border:0;background:var(--scene-wash);color:var(--scene-ink);pointer-events:auto;cursor:pointer;text-decoration:none}
  .icon-action svg{filter:drop-shadow(0 1px 2px var(--scene-shade))}
  .primary{background:#f3e7cd;color:var(--ink)}
  .primary svg{filter:none}
  .icon-action[aria-current=page]::after{content:'';position:absolute;bottom:5px;width:5px;height:2px;border-radius:2px;background:currentColor}
  .icon-action:enabled:hover,a.icon-action:hover,.icon-action:focus-visible{background:#224638e8;color:var(--scene-ink)}
  .icon-action:focus-visible{outline:2px solid #f4d59d;outline-offset:2px}
  .icon-action:disabled{opacity:.5;cursor:default}
  .caption{position:absolute;right:calc(100% + 8px);top:50%;width:max-content;padding:.4rem .25rem;color:var(--scene-ink);text-shadow:var(--scene-type-shadow);font:500 .83rem/1.25 var(--font-ui);white-space:nowrap;pointer-events:none;opacity:0;transform:translate(4px,-50%)}
  .icon-action:is(:hover,:focus-visible) .caption{opacity:1;transform:translate(0,-50%)}
  @media(hover:none){.caption{opacity:1;transform:translate(0,-50%);pointer-events:auto}}
  @media(prefers-reduced-motion:no-preference){.caption{transition:opacity .14s,transform .14s}.icon-action:active svg{transform:scale(.91)}}
</style>
