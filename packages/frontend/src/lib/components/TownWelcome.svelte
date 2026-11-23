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
        <div class="leaf" bind:this={controls}><button class="atlas-link subtle back" onclick={back}>← Back to the valley</button>{@render children()}</div>
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
  .arrival{overflow:auto;color:var(--scene-ink);background:var(--scene-shade)}
  .river-view{position:relative;isolation:isolate;min-height:100%;display:flex;align-items:safe end;padding:calc(var(--mast-height) + var(--space-7)) var(--gutter) clamp(var(--space-6),9vh,var(--space-9))}
  .river-view:before{position:absolute;inset:0;content:'';z-index:-1;background:linear-gradient(90deg,color-mix(in srgb,var(--scene-shade) 50%,transparent),transparent 65%),linear-gradient(0deg,color-mix(in srgb,var(--scene-shade) 91%,transparent),transparent 64%);pointer-events:none}
  .intro{max-width:40rem;text-shadow:0 1px 18px color-mix(in srgb,var(--scene-shade) 60%,transparent)}
  h1{font:400 var(--display-hero)/.94 var(--font);letter-spacing:var(--ls-hero);text-wrap:balance}
  .intro p{max-width:26ch;margin-top:var(--space-5);font:400 var(--text-xl)/1.35 var(--font);letter-spacing:var(--ls-heading);color:var(--scene-ink-muted);text-wrap:pretty}
  .links{display:flex;align-items:center;gap:var(--space-3) var(--space-6);flex-wrap:wrap;margin-top:var(--space-7)}
  .links button{display:inline-flex;align-items:center;gap:var(--space-2);min-height:48px;border:0;font:400 var(--ui-lg)/1.2 var(--font);letter-spacing:var(--ls-ui);text-shadow:none;cursor:pointer}
  /* Primary: a cream pill, the scene's raised tone. Secondary: underlined scene type. */
  .begin{padding:0 var(--space-6);border-radius:var(--radius-pill);background:var(--scene-raised);color:var(--scene-on-raised);transition:background-color var(--dur-fast) var(--ease-soft),transform var(--dur-fast) var(--ease-soft)}
  .begin:hover{background:var(--scene-ink)}.begin:active{transform:translateY(1px)}
  .visit{padding:0;background:transparent;color:var(--scene-ink);text-decoration:underline;text-decoration-thickness:1px;text-decoration-color:color-mix(in srgb,var(--scene-ink) 45%,transparent);text-underline-offset:.35em;transition:text-decoration-color var(--dur-micro) var(--ease-soft)}
  .visit:hover{text-decoration-color:currentColor}
  .links button:focus-visible{outline-color:var(--scene-focus)}
  .leaf{align-self:safe center;width:min(100%,var(--measure-form));display:grid;gap:var(--space-3);padding:var(--sheet-inset);border-radius:var(--radius-s);background:var(--paper);color:var(--ink);box-shadow:var(--shadow-sheet)}
  .back{margin-left:0}
  @media(prefers-reduced-motion:no-preference){
    .intro > *{animation:arrive var(--dur-slow) var(--ease-out) backwards}
    .intro p{animation-delay:80ms}.links{animation-delay:160ms}
    .leaf{animation:arrive var(--dur-base) var(--ease-out) backwards}
    @keyframes arrive{from{opacity:0;transform:translateY(12px)}}
  }
</style>
