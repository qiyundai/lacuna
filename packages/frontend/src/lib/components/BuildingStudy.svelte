<script lang="ts">
  import { onMount } from 'svelte';
  import type { openBuildingStudy } from '$lib/town/building-study.js';

  let {model}: {model: 'tide-house' | 'ferry-hall'} = $props();
  const hall = $derived(model === 'ferry-hall');
  const title = $derived(hall ? 'Ferry Hall' : 'Tide House');
  const description = $derived(hall ? 'Ferry Hall, with an open stone arcade, clock gates and a long copper roof.' : 'Tide House, with a stone arcade, terracotta upper floors and a copper mansard roof.');
  let canvas: HTMLCanvasElement;
  let count = $state(4);
  let study = $state.raw<ReturnType<typeof openBuildingStudy>>();
  let failed = $state(false);
  onMount(() => {
    count = hall ? 5 : 4;
    let closed = false;
    Promise.all([import('$lib/town/building-study.js'), import('$lib/town/gouache.js')])
      .then(async ([{openBuildingStudy}, {loadGouache}]) => {
        if (closed) return;
        const paint = await loadGouache();
        if (closed) { paint?.dispose(); return; }
        try { study = openBuildingStudy(canvas, model, paint); }
        catch (error) { paint?.dispose(); throw error; }
      }).catch(() => { if (!closed) failed = true; });
    return () => { closed = true; study?.dispose(); };
  });
  $effect(() => { study?.setCount(count); });
</script>

<svelte:head><title>{title} · Lacuna</title></svelte:head>
<main>
  <header><h1>{title}</h1><nav><a href={hall ? '/studio/tide-house' : '/studio/ferry-hall'}>{hall ? 'Tide House' : 'Ferry Hall'}</a><a href="/">Back to Lacuna ↗</a></nav></header>
  <div class="stage">
    <canvas bind:this={canvas} tabindex="0" aria-label="{description} Drag or use arrow keys to orbit. Scroll, pinch or use plus and minus to zoom. Home fits the building."></canvas>
    {#if failed}
      <img src={'/city/harbor/' + model + '-study.webp'} alt={description}/>
      <p role="status">Still view · Enable WebGL 2 to rotate the model.</p>
    {/if}
  </div>
  <footer>
    <div class="floors"><label for="count">{hall ? 'Bays' : 'Floors'}</label><input id="count" type="range" min={hall ? 3 : 1} max={hall ? 9 : 18} step={hall ? 2 : 1} bind:value={count} disabled={!study}/><output for="count">{count}</output></div>
    <div class="turn"><button aria-label="Turn left one quarter" onclick={() => study?.turn(Math.PI / 2)} disabled={!study}>↶</button><button aria-label="Turn right one quarter" onclick={() => study?.turn(-Math.PI / 2)} disabled={!study}>↷</button></div>
  </footer>
</main>

<style>
  main{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#304748;color:#f2e9d8;font-family:var(--font-ui)}
  header,footer{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:10px clamp(18px,4vw,60px)}
  header{border-bottom:1px solid #d5d6c42e}h1{font:400 clamp(1.65rem,3vw,2.45rem)/1.3 var(--font-reading);letter-spacing:-.04em}
  a{color:inherit;font-size:.91rem;text-underline-offset:.25rem;display:inline-flex;align-items:center;min-height:44px}
  nav{display:flex;gap:clamp(8px,2vw,25px)}
  .stage{position:relative;min-height:0}canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}canvas:active{cursor:grabbing}
  img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#304748}
  p{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);padding:4px 10px;text-align:center;background:#253d3c;color:#f2e9d8;font-size:.85rem}
  footer{border-top:1px solid #d5d6c42e}
  .floors,.turn{display:flex;align-items:center;gap:clamp(.45rem,1.7vw,1.3rem)}
  input[type=range]{width:clamp(80px,18vw,230px);height:44px;accent-color:#e6c799}output{min-width:2ch;font-variant-numeric:tabular-nums}
  .turn{gap:4px}button{background:transparent;color:inherit;border:1px solid #b7c0b77d;border-radius:3px;min-width:44px;height:44px;cursor:pointer;font:1.45rem var(--font-ui)}
  @media(max-width:420px){footer{gap:5px;padding-inline:9px}.floors{gap:4px}.turn{gap:2px}}
  button:hover{background:#e3dfca1c}button:active{transform:translateY(1px)}:is(a,button,input,canvas):focus-visible{outline:2px solid #ffe0a9;outline-offset:-3px}
</style>
