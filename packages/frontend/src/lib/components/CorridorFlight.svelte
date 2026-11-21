<script lang="ts">
  import { onMount } from 'svelte';

  let video:HTMLVideoElement;
  let moving=$state(false),requested=$state(false),visible=$state(true),unavailable=$state(false);

  onMount(()=>{
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion=()=>{moving=!preference.matches;};
    const syncVisibility=()=>{visible=!document.hidden;};
    syncMotion();syncVisibility();
    preference.addEventListener('change',syncMotion);
    document.addEventListener('visibilitychange',syncVisibility);
    return ()=>{
      preference.removeEventListener('change',syncMotion);
      document.removeEventListener('visibilitychange',syncVisibility);
    };
  });

  $effect(()=>{
    if(!moving||!visible||unavailable){video.pause();return;}
    if(!requested){requested=true;return;}
    let current=true;
    video.play().catch(()=>{if(current)moving=false;});
    return ()=>{current=false;};
  });
</script>

<video bind:this={video} src={requested?'/city/valley-flight.mp4':undefined} poster="/city/valley-flight.webp"
  muted loop playsinline preload="none" aria-hidden="true" onerror={()=>{unavailable=true;}}></video>
{#if !unavailable}
  <button class="flight-control" aria-label={moving?'Pause corridor flight':'Play corridor flight'}
    title={moving?'Pause corridor flight':'Play corridor flight'} onclick={()=>moving=!moving}>
    <span class:playing={moving} aria-hidden="true"></span>
  </button>
{/if}

<style>
  video{position:absolute;inset:0;width:100%;height:100%;z-index:-2;object-fit:cover;object-position:60% center;background:#253b33 url('/city/valley-flight.webp') 60% center/cover}
  .flight-control{position:absolute;right:var(--gutter);bottom:clamp(18px,4vh,42px);width:44px;height:44px;display:grid;place-items:center;border:1px solid #e5e8db91;border-radius:50%;background:#152925bf;color:#fff3d9;cursor:pointer}
  .flight-control:hover{background:#152925}.flight-control span{width:0;height:0;border-left:10px solid currentColor;border-block:6px solid transparent;margin-left:3px}
  .flight-control .playing{width:10px;height:12px;border:0;border-inline:3px solid currentColor;margin:0}
  @media(max-width:600px){video{object-position:64% center}.flight-control{top:calc(var(--mast-height) + 10px);bottom:auto}}
</style>
