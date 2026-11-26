<script lang="ts">
  import IconAction from '$lib/components/IconAction.svelte';
  import { swipeDetector } from '$lib/gesture.js';
  import DownSpace from '$lib/components/DownSpace.svelte';
  import JournalCity from '$lib/components/JournalCity.svelte';

  import Masthead from '$lib/components/Masthead.svelte';
  import UserMenu from '$lib/components/UserMenu.svelte';

  import { onMount, tick } from 'svelte';
  let archiveRevision=$state(0);
  onMount(()=>{
    const refreshArchive=()=>archiveRevision++;
    window.addEventListener('lacuna:sync-applied',refreshArchive);
    return ()=>window.removeEventListener('lacuna:sync-applied',refreshArchive);
  });
  let settings:UserMenu;
  let busy=$state(false),draft=$state(''),draftId=$state('');
  let view=$state<'town'|'journal'>('town');
  let surface:HTMLDivElement;
  let entrance:Animation|undefined;
  async function navigate(next:typeof view){
    if(next===view)return;
    view=next;
    await tick();
    if(view!==next)return;
    entrance?.cancel();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      entrance=surface.animate([{opacity:.2},{opacity:1}],{duration:160,easing:'ease-out'});
    }
    const destination=next==='town'?'.coast h1':'.masthead .trigger';
    document.querySelector<HTMLElement>(destination)?.focus({preventScroll:true});
  }
  const town=()=>navigate('town');
</script>
{#snippet navigation()}
  {#if view==='town'}
    <IconAction icon="journal" label="Timeline" disabled={busy} onclick={()=>navigate('journal')}/>
  {:else}
    <IconAction icon="town" label="Return to city" onclick={town}/>
  {/if}
  <IconAction icon="settings" label="Journal settings" onclick={()=>settings.showSettings()}/>
{/snippet}
<UserMenu bind:this={settings}/>
<div class="surface" bind:this={surface}>
{#if view==='town'}
  <JournalCity bind:busy bind:draft bind:draftId {navigation}/>
{:else}
  <div class="application">
    <Masthead journalMenu>{@render navigation()}</Masthead>
    <div class="page" use:swipeDetector={{onSwipeUp:town}}>
      {#key archiveRevision}<DownSpace active/>{/key}
    </div>
  </div>
{/if}
</div>
<style>
  .surface{height:100%}
  .application{height:100%;display:grid;grid-template-rows:var(--mast-height) minmax(0,1fr)}
  .page{position:relative;height:100%;min-height:0}
</style>
