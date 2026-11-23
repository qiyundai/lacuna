<script lang="ts">
  import { onMount } from 'svelte';
  import IconAction from './IconAction.svelte';
  import { lightAt,localHour,type ArrivalPhase } from '$lib/town/city-clock.js';

  let video:HTMLVideoElement;
  let phase=$state<ArrivalPhase>(),resumeAt=0;
  const media=$derived(phase && '/city/valley-flight'+(phase==='day'?'':'-'+phase));
  let moving=$state(false),requested=$state(false),visible=$state(true),unavailable=$state(false);

  onMount(()=>{
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion=()=>{moving=!preference.matches;};
    const syncPhase=()=>{
      if(document.hidden)return;
      const next=lightAt(localHour()).phase;
      if(phase!==next){
        if(video.readyState>=1)resumeAt=video.currentTime;
        phase=next;unavailable=false;
      }
    };
    const syncVisibility=()=>{visible=!document.hidden;if(visible)syncPhase();};
    const timer=window.setInterval(syncPhase,30_000);
    window.addEventListener('pageshow',syncVisibility);
    syncMotion();syncVisibility();
    preference.addEventListener('change',syncMotion);
    document.addEventListener('visibilitychange',syncVisibility);
    return ()=>{
      clearInterval(timer);window.removeEventListener('pageshow',syncVisibility);
      preference.removeEventListener('change',syncMotion);
      document.removeEventListener('visibilitychange',syncVisibility);
    };
  });

  $effect(()=>{
    if(!media||!moving||!visible||unavailable){video.pause();return;}
    if(!requested){requested=true;return;}
    let current=true;
    if(video.readyState>=1)void video.play().catch(e=>{if(current&&e.name!=='AbortError')moving=false;});
    return ()=>{current=false;};
  });
</script>

<video bind:this={video} src={requested&&media?media+'.mp4':undefined} poster={media?media+'.webp':undefined}
  onloadedmetadata={()=>{
    if(resumeAt>0&&Number.isFinite(video.duration))video.currentTime=resumeAt%video.duration;
    resumeAt=0;
    if(moving&&visible)void video.play().catch(e=>{if(e.name!=='AbortError')moving=false;});
  }}
  muted loop playsinline preload={requested?'metadata':'none'} aria-hidden="true" onerror={()=>{unavailable=true;}}></video>
{#if !unavailable}
  <div class="flight-control">
    <IconAction tone="solid" labelled={false} icon={moving?'pause':'play'} label={moving?'Pause corridor flight':'Play corridor flight'} onclick={()=>moving=!moving}/>
  </div>
{/if}

<style>
  video{position:absolute;inset:0;width:100%;height:100%;z-index:-2;object-fit:cover;object-position:60% center;background:var(--scene-shade)}
  .flight-control{position:absolute;right:var(--gutter);bottom:var(--edge-bottom)}
  @media(max-width:600px){
    video{object-position:64% center}
    .flight-control{inset:calc(var(--mast-height) + var(--space-2)) auto auto var(--gutter)}
    /* At the left edge, the caption opens rightward so it stays on screen */
    .flight-control :global(.scene-caption){left:calc(100% + var(--space-2));right:auto}
  }
</style>
