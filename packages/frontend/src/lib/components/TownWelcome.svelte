<script lang="ts">
  import IconAction from './IconAction.svelte';
  import { onMount, tick, type Snippet } from 'svelte';
  import { enterValley, readSoundPreferences, willPlaySound } from '$lib/valley-playback.svelte.js';
  import SoundCue from './SoundCue.svelte';
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
  onMount(()=>{readSoundPreferences();window.dispatchEvent(new Event('lacuna:prepare-music'));});
  const audible=$derived(willPlaySound());
</script>
<div class="welcome" class:menu={!walking}>

  {#if walking}<JournalCity guest onExit={leave}/>
  {:else}
    <Masthead floating><IconAction href="/privacy" icon="privacy" label="Privacy"/></Masthead>
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
          <button class="visit" bind:this={walkButton} aria-label={'Visit the example city'+(audible?' with sound':'')} onclick={()=>{enterValley();walking=true;}}>Visit the example city<SoundCue/></button></div>
        </div>
      {/if}
      </section>
    </main>
  {/if}
</div>
<style>
  .welcome{height:100%;position:relative}
  .menu .arrival{height:100%}
  .arrival{overflow:auto;color:var(--scene-ink);background:var(--scene-shade)}.river-view{position:relative;isolation:isolate;min-height:100%;display:flex;align-items:safe end;padding:clamp(22px,6.5vw,110px) var(--gutter)}
  .river-view{padding-top:calc(var(--mast-height) + 55px)}
  .river-view:before{position:absolute;inset:0;content:'';z-index:-1;background:linear-gradient(90deg,color-mix(in srgb,var(--scene-shade) 50%,transparent),transparent 65%),linear-gradient(0deg,color-mix(in srgb,var(--scene-shade) 91%,transparent),transparent 64%);pointer-events:none}
  .intro{padding-bottom:min(3vh,30px);max-width:38rem}
  h1{margin:0 0 .8rem;font:400 clamp(4.4rem,8.7vw,9.8rem)/.96 var(--font);letter-spacing:-.065em}
  .intro p{max-width:28ch;font:400 clamp(1.25rem,2vw,1.75rem)/1.4 var(--font)}
  .links{display:flex;align-items:center;gap:.5rem var(--space-6);flex-wrap:wrap;margin-top:var(--space-6)}.links button{min-height:48px;padding:0;border:0;background:transparent;color:inherit;font:400 1rem/1.3 var(--font);text-underline-offset:.35em;cursor:pointer}
  .links .begin{font:400 1.4rem var(--font);text-decoration:underline;text-decoration-thickness:1px}.links button:hover,.links button:focus-visible{text-decoration:underline}.links button:focus-visible{outline-color:var(--scene-focus)}.visit{display:inline-flex;align-items:center;gap:var(--space-2)}
  .leaf{align-self:safe center;width:min(100%,30rem);background:var(--paper);color:var(--ink);padding:var(--sheet-inset)}
  .leaf>.atlas-link{margin-bottom:12px}@media(max-width:550px){.intro{padding-bottom:3vh}}
</style>
