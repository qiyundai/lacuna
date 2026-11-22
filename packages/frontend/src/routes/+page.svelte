<script lang="ts">
  import IconAction from '$lib/components/IconAction.svelte';
  import { swipeDetector } from '$lib/gesture.js';
  import Void from '$lib/components/Void.svelte';
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
  let view=$state<'town'|'journal'|'quiet'>('town');
  let section=$state<0|1|2>(0);
  const destinations=[['town','City'],['journal','Journal'],['quiet','Quiet writing']] as const;
  function archive(next:0|1|2){section=next;view='journal';}
  const journal=()=>archive(0);
  async function navigate(next:typeof view){
    if(next==='journal')journal();else view=next;
    await tick();
    const destination=next==='town'?'.coast h1':'.masthead .trigger';
    document.querySelector<HTMLElement>(destination)?.focus({preventScroll:true});
  }
  const town=()=>{view='town';};
</script>
{#snippet navigation()}
  {#each destinations as item}
    <IconAction icon={item[0]} label={item[1]} current={view===item[0]?'page':undefined} disabled={busy} onclick={()=>navigate(item[0])}/>
  {/each}
  <IconAction icon="settings" label="Journal settings" onclick={()=>settings.showSettings()}/>
{/snippet}
<UserMenu bind:this={settings}/>
{#if view==='town'}
  <JournalCity bind:busy bind:draft bind:draftId {navigation}/>
{:else}
  <div class="application">
    <Masthead>{@render navigation()}</Masthead>
    <div class="page" use:swipeDetector={{onSwipeDown:journal,onSwipeUp:town}}>
      {#if view==='quiet'}<Void onSwipeDown={journal}/>{:else}{#key archiveRevision}<DownSpace active initial={section}/>{/key}{/if}
    </div>
  </div>
{/if}
<style>
  .application{height:100%;display:grid;grid-template-rows:var(--mast-height) minmax(0,1fr)}
  .page{position:relative;height:100%;min-height:0}
</style>
