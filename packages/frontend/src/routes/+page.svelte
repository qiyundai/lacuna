<script lang="ts">
  import { swipeDetector } from '$lib/gesture.js';
  import Void from '$lib/components/Void.svelte';
  import DownSpace from '$lib/components/DownSpace.svelte';
  import JournalCity from '$lib/components/JournalCity.svelte';

  import Masthead from '$lib/components/Masthead.svelte';
  import UserMenu from '$lib/components/UserMenu.svelte';

  let busy=$state(false);
  let view=$state<'town'|'journal'|'quiet'>('town');
  let section=$state<0|1|2>(0);
  function archive(next:0|1|2){section=next;view='journal';}
  const journal=()=>archive(0);
  const quiet=()=>{view='quiet';};
  const town=()=>{view='town';};
</script>
<div class="application">
  <Masthead>
    <button aria-current={view==='town'?'page':undefined} disabled={busy} onclick={town}>City</button>
    <button aria-current={view==='journal'?'page':undefined} disabled={busy} onclick={journal}>Journal</button>
    <button aria-current={view==='quiet'?'page':undefined} disabled={busy} onclick={quiet}>Quiet writing</button>
    <UserMenu />
  </Masthead>
  <div class="work-area">
    {#if view==='town'}<JournalCity bind:busy/>
    {:else}
      <div class="page" use:swipeDetector={{onSwipeDown:journal,onSwipeUp:town}}>
        {#if view==='quiet'}<Void onSwipeDown={journal}/>{:else}<DownSpace active initial={section}/>{/if}
      </div>
    {/if}
  </div>
</div>
<style>
  .application{height:100%;display:grid;grid-template-rows:var(--mast-height) minmax(0,1fr)}
  .work-area,.page{position:relative;height:100%;min-height:0}
</style>
