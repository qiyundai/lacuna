<script lang="ts">
  import Icon from './Icon.svelte';
  import { monuments, type MonumentId } from '../../../../shared/monuments.js';

  let {weeks, onread, onvisit, onopen, canVisit}:
    {weeks:number; onread:()=>void; onvisit:(id:MonumentId)=>void; onopen:(open:boolean)=>void; canVisit:boolean}=$props();
  let dialog:HTMLDialogElement;
  let selected=$state(0);
  const last=$derived(Math.min(monuments.filter(item=>weeks>=item.weeks).length,monuments.length-1));
  const card=$derived(monuments[Math.min(selected,last)]!);
  const opened=$derived(weeks>=card.weeks);
  const titleId=$props.id();

  export function show() {
    selected=last;
    dialog.showModal();
    onopen(true);
    onread();
  }

  function visit() {
    dialog.close();
    onvisit(card.id);
  }
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} onclose={()=>onopen(false)}>
  <button type="button" class="paper-control close" aria-label="Close postcard" onclick={()=>dialog.close()}><Icon name="close"/></button>
  <img class:linen={card.id==='linen-exchange'} src={'/city/postcards/'+card.id+'.webp'} width="512" height="512" loading="lazy" alt=""/>
  <div class="caption" aria-live="polite">
    <h2 id={titleId}>{card.name}</h2>
    {#if opened}
      <p>Open in your city</p>
      {#if canVisit}<button class="atlas-link" onclick={visit}>Visit monument ↗</button>{/if}
    {:else}
      <p>{weeks} of {card.weeks} writing weeks</p>
      <div class="line" aria-hidden="true">{#each Array(card.weeks) as _,i}<i class:inked={i<weeks}></i>{/each}</div>
      <small>A week counts when you save a page.</small>
    {/if}
  </div>
  {#if last>0}
    <nav aria-label="Postcards">
      <button class="paper-control" aria-label="Previous postcard" disabled={selected===0} onclick={()=>selected--}><Icon name="chevron-left"/></button>
      <span>{selected+1} / {last+1}</span>
      <button class="paper-control" aria-label="Next postcard" disabled={selected>=last} onclick={()=>selected++}><Icon name="chevron-right"/></button>
    </nav>
  {/if}
</dialog>

<style>
  dialog{margin:auto;width:min(29rem,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);overflow:auto;box-sizing:border-box;border:1px solid #bcb8a5;border-radius:.5rem;padding:0;background:#f9f4ea;color:#28493d;box-shadow:0 .6rem 2rem #12271f55;font-family:var(--font)}
  dialog:modal,dialog::backdrop{overscroll-behavior:contain}
  dialog::backdrop{background:#122b2469;overflow:hidden}
  .close{position:absolute;right:.6rem;top:.6rem;z-index:1;background:var(--paper)}
  img{width:100%;height:clamp(6rem,29dvh,14rem);object-fit:contain;display:block}
  img.linen{object-fit:cover;object-position:50% 4%}
  .caption{padding:.4rem clamp(1rem,5vw,2rem) 1.25rem}
  h2{margin:0;font-size:clamp(1.6rem,5vw,2.1rem);font-weight:400;letter-spacing:-.04em}
  p{margin:.5rem 0 .8rem}
  small{font-size:.88rem}
  .line{position:relative;display:flex;align-items:center;justify-content:space-around;height:1rem;margin:0 0 .7rem}
  .line::before{content:'';position:absolute;left:0;right:0;border-top:1px solid currentColor}
  i{position:relative;height:.8rem;width:clamp(3px,1vw,6px);border:1px solid currentColor;border-radius:2px;background:#f8f6ec}
  .inked{background:currentColor}
  nav{border-top:1px solid #bbb8a744;display:flex;align-items:center;justify-content:center;gap:.6rem;font-size:.85rem}
</style>
