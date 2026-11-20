<script lang="ts">
  import { onMount,tick } from 'svelte';
  import { api,isCompanion,type EntryData,type MemoirEdition,type ModelWeights } from '$lib/api.js';
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { vaultStore } from '$lib/stores/vault.svelte.js';
  import { prependEntry } from '$lib/stores/entries.svelte.js';
  import { sessionVersion } from '$lib/session-version.js';
  import { attachPresence,presences,reviseThread } from '../../../../shared/village.js';
  import { changes,districts,type District } from '$lib/town/districts.js';
  import type { createAtlas } from '$lib/town/atlas.js';
  let {guest=false,onExit,openArchive,busy=$bindable(false)}:{
    guest?:boolean;onExit?:()=>void;openArchive?:(section:0|1|2)=>void;busy?:boolean
  }=$props();
  type Panel='write'|'places'|'pages'|'gardener'|'bookbinder'|null;
  let panel=$state<Panel>(null),selected=$state(''),ready=$state(false),still=$state(false);
  let canvas:HTMLCanvasElement,dialog:HTMLDialogElement;
  let entries=$state.raw<EntryData[]>([]),scene=$state.raw<Awaited<ReturnType<typeof createAtlas>>|null>(null);
  let alive=false,graphicsError=$state(false),error=$state(''),notice=$state(''),draft=$state(''),draftId='';
  let memoir=$state<MemoirEdition|null>(null),weights=$state<ModelWeights|null>(null),asked=$state(false),consulting=$state(false),sharePage=$state(false);
  const map=$derived(districts(entries));
  const place=$derived(map.find(d=>d.pages.some(p=>p.entry.id===selected)));
  const threads=$derived(presences(entries));
  const thread=$derived(threads.find(g=>g.id===place?.thread));
  const returning=$derived(threads.filter(g=>g.entries.length>1).sort((a,b)=>b.entries.length-a.entries.length)[0]);
  async function read(){
    try{
      const sample=['I planted basil by the kitchen window.','Dad sends me the forecast every morning.','We shared bread and coffee together at the table.'];
      const data=guest?{entries:sample.map((body,i)=>({id:String(i+1).repeat(32),body,created_at:1+i,solidified_at:1+i,kept_at:null,user_id:'guest'}))}:await api.village.get();
      if(alive){entries=data.entries;ready=true;error='';}
    }catch{if(alive)error='Your pages could not be opened.';}
  }
  async function graphics(){
    graphicsError=false;
    try{
      const {createAtlas}=await import('$lib/town/atlas.js');
      if(!alive)return;
      const atlas=await createAtlas(canvas,id=>{const area=map.find(d=>d.id===id);if(area)visit(area);});
      if(alive){
        if(selected)atlas.reveal(selected);
        scene=atlas;
      }else atlas.destroy();
    }catch{if(alive)graphicsError=true;}
  }
  onMount(()=>{alive=true;void read();void graphics();return ()=>{alive=false;scene?.destroy();};});
  $effect(()=>{scene?.update(map);});
  $effect(()=>{scene?.pause(still);});
  async function show(next:Exclude<Panel,null>){
    if(busy)return;
    panel=next;asked=false;weights=null;memoir=null;error='';
    await tick();if(dialog&&!dialog.open)dialog.showModal();
  }
  function close(){dialog?.close();panel=null;}
  function visit(area:District){
    selected=area.pages.at(-1)!.entry.id;notice='';scene?.focus(area.x,area.z);void show('pages');
  }
  async function revise(entry:EntryData,separate:boolean){
    if(busy)return;
    busy=true;
    try{
      const result=guest?reviseThread(structuredClone(entries),{entry:entry.id,separate}):await api.village.revise(entry.id,separate);
      if(alive){entries=result.entries;selected=entry.id;}
    }catch{if(alive)error='The thread could not be updated.';}
    finally{if(alive)busy=false;}
  }
  async function interpret(id:string,version:number){
    try{
      const {entry}=await companionRequest<{entry:EntryData}>('village/interpret','POST',{entry:id,consent:true});
      if(!alive || sessionVersion.value!==version)return;
      entries=entries.map(e=>e.id===id?{...e,presence:entry.presence,reading:entry.reading}:e);
      if(entries.at(-1)?.id===id)selected=id;
    }catch{if(alive && sessionVersion.value===version)notice='Page saved. The village used its local reading.';}
  }
  async function save(){
    const body=draft.trim();if(!body || busy || !ready)return;
    draftId ||= crypto.randomUUID().replaceAll('-','');
    const version=sessionVersion.value;busy=true;error='';
    try{
      const now=Math.floor(Date.now()/1000);
      let saved:EntryData;
      if(guest){saved={id:draftId,body,created_at:now,solidified_at:now,kept_at:null,user_id:'guest'};attachPresence(entries,saved);}
      else saved=(await api.entries.create(body,now,draftId)).entry;
      if(!alive || version!==sessionVersion.value)return;
      if(!guest)prependEntry(saved);
      scene?.reveal(saved.id);entries=[...entries.filter(e=>e.id!==saved.id),saved];selected=saved.id;draft='';draftId='';
      close();const area=districts(entries).find(d=>d.pages.some(p=>p.entry.id===saved.id));
      const page=area?.pages.find(p=>p.entry.id===saved.id);
      notice=page?(area?.landing?.entry.id===saved.id?'The ferry has begun its crossings.':changes[page.activity]):'Page saved.';
      if(!guest && isCompanion && sharePage && vaultStore.status?.aiAllowed)void interpret(saved.id,version);
      sharePage=false;
    }catch{if(alive)error='Your page is still here. Try saving again.';}
    finally{if(alive)busy=false;}
  }
  async function ask(){
    if(consulting)return;
    const current=panel;asked=true;consulting=true;
    try{
      if(!guest && isCompanion){
        if(current==='gardener'){const result=await api.patterns.get();if(alive&&panel===current)weights=result.model_weights;}
        else {const result=await api.memoir.get();if(alive&&panel===current)memoir=result;}
      }
    }catch{if(alive)error='The reading could not be opened.';}
    finally{if(alive)consulting=false;}
  }
</script>
<main class="atlas" aria-label="Living river valley">
  <canvas bind:this={canvas} tabindex="0" aria-label="River valley. Drag to orbit, right-drag or use two fingers to pan, and scroll to zoom. Arrow keys move the view."></canvas>
  <nav class="tools" aria-label="Map controls">
    {#if guest}<button disabled={busy} onclick={onExit}>Leave guest visit</button>{/if}
    <button onclick={()=>show('places')}>Places</button>
    <button class="motion" aria-label={still?'Resume ambient motion':'Pause ambient motion'} onclick={()=>still=!still}>{still?'▷':'Ⅱ'}</button>
  </nav>
  <div class="dock">
    <div class="title">
      <h1>{place?.name??'The river valley'}</h1>
      <p role="status">{error||notice||(graphicsError?'The map could not be drawn. Your pages are available under Places.':!scene?'Opening the valley…':'')}</p>
    </div>
    <div class="actions">
      <button class="write" disabled={!ready||busy} onclick={()=>show('write')}>Write a page</button>
      {#if place}<button onclick={()=>show('pages')}>Read this place</button>{/if}
      {#if graphicsError}<button onclick={graphics}>Retry map</button>{/if}
      {#if error&&!ready}<button onclick={read}>Retry journal</button>{/if}
    </div>
  </div>
  <dialog bind:this={dialog} aria-labelledby="sheet-title" oncancel={e=>{if(busy)e.preventDefault();}} onclose={()=>panel=null}>
    {#if panel}
      <div class="paper">
        <button class="close" aria-label="Close" disabled={busy} onclick={close}>×</button>
        {#if panel==='write'}
          <h2 id="sheet-title">Your journal</h2>
          {#if guest}<p class="muted">Guest pages last for this visit.</p>{/if}
          <form onsubmit={e=>{e.preventDefault();void save();}}>
            <label for="page-body">What’s on your mind?</label>
            <textarea id="page-body" bind:value={draft} oninput={()=>draftId=''} maxlength="500" rows="5" required></textarea>
            {#if !guest && isCompanion && vaultStore.status?.aiAllowed}
              <label><input type="checkbox" bind:checked={sharePage}/> Let ChatGPT read this page and up to six earlier excerpts to connect related pages.</label>
            {/if}
            <button class="ink" disabled={!draft.trim()||busy}>{busy?'Saving…':'Save page'}</button>
          </form>
        {:else if panel==='places'}
          <h2 id="sheet-title">Places</h2>
          {#each map as area (area.id)}
            <button class="place-row" onclick={()=>visit(area)}><strong>{area.name}</strong><span>{area.pages[0]?.entry.body}</span></button>
          {:else}<p>Your first page will give this stretch of the river a place of its own.</p>{/each}
          <button class="row" onclick={()=>show('gardener')}>Visit the gardener</button>
          <button class="row" onclick={()=>show('bookbinder')}>Visit the bookbinder</button>
        {:else if panel==='pages' && place}
          <h2 id="sheet-title">{place.name}</h2>
          {#each place.pages as page (page.entry.id)}
            <div class="page"><blockquote>{page.entry.body}</blockquote>
              <p class="muted">{place.landing?.entry.id===page.entry.id?'The ferry began crossing with this page.':changes[page.activity]}</p>
              {#if page.entry.previousPresence}<button class="row" disabled={busy} onclick={()=>revise(page.entry,false)}>Rejoin the earlier thread</button>
              {:else if thread && page.entry.id!==thread.id && thread.entries.length>1}<button class="row" disabled={busy} onclick={()=>revise(page.entry,true)}>Keep this page apart</button>{/if}
            </div>
          {/each}
          {#each map.filter(d=>d.thread===place?.thread && d.id!==place?.id) as related}
            <button class="place-row" onclick={()=>visit(related)}><strong>{related.name}</strong><span>{related.pages[0]?.entry.body}</span></button>
          {/each}
        {:else if panel==='gardener'}
          <h2 id="sheet-title">The gardener</h2>
          <button class="row" disabled={consulting} onclick={ask}>What keeps returning in my writing?</button>
          {#if asked}
            {#if weights?.emerging_theme}<p>{weights.emerging_theme}</p>{/if}
            {#if returning}{#each returning.entries.slice(-3) as entry}<blockquote>{entry.body}</blockquote>{/each}
            {:else}<p>I haven’t found a recurring thread in these pages yet.</p>{/if}
            {#if !guest && isCompanion}<button class="row" onclick={()=>openArchive?.(1)}>Read the six lenses ↗</button>{/if}
          {/if}
        {:else if panel==='bookbinder'}
          <h2 id="sheet-title">The bookbinder</h2>
          <button class="row" disabled={consulting} onclick={ask}>May I read my latest edition?</button>
          {#if asked}
            {#if memoir}<p class="prose">{memoir.prose}</p>{:else if !consulting}<p>There’s no bound edition here yet. Your original pages are in the journal.</p>{/if}
            {#if !guest && isCompanion}<button class="row" onclick={()=>openArchive?.(2)}>Open the memoir shelf ↗</button>{/if}
          {/if}
        {/if}
        {#if error}<p role="alert">{error}</p>{/if}
      </div>
    {/if}
  </dialog>
</main>
<style>
  .atlas{height:100%;min-height:0;position:relative;overflow:hidden;background:#8c9e91 url('/town/valley-painting.webp') center/cover;color:#fff8e8}
  canvas{width:100%;height:100%;display:block;touch-action:none;cursor:grab}canvas:active{cursor:grabbing}canvas:focus-visible{outline:2px solid #f1dfa9;outline-offset:-3px}
  .tools,.dock{position:absolute;z-index:1}.tools{top:clamp(12px,2.8vh,28px);right:var(--gutter);display:flex;gap:7px}
  button{font:500 .95rem/1.25 var(--font-ui);cursor:pointer;min-height:44px}
  .tools button,.actions button{border:1px solid #c8c6af;background:#f4f1e2ed;color:#293d32;padding:8px 16px;border-radius:4px}
  .tools .motion{border-radius:50%;min-width:44px;padding:5px}
  .dock{inset:auto 0 0;padding:3.3rem var(--gutter) clamp(20px,4vh,44px);background:linear-gradient(transparent,#152c24c9);pointer-events:none}
  .dock button{pointer-events:auto}.dock h1{font:400 clamp(2.7rem,5.3vw,5.5rem)/1 var(--font-reading);letter-spacing:-.055em;margin:0}
  .dock p{margin:.5rem 0;font:1rem/1.45 var(--font-ui)}.dock p:empty{display:none}.actions{display:flex;gap:8px;margin-top:.85rem}
  .actions button:not(.write){background:#20392ee0;color:#fff5df;border-color:#a4b6a5}
  dialog{inset:auto var(--gutter) clamp(20px,4vh,44px) auto;margin:0;max-height:76dvh;width:min(29rem,calc(100% - 32px));border:1px solid #bbb39e;border-radius:5px;background:#f7f2e4;color:var(--ink);box-shadow:0 12px 50px #1a28284a}
  dialog::backdrop{background:#14282028}.paper{position:relative;padding:clamp(22px,3vw,40px);display:grid;gap:1rem}
  h2{margin:0;padding-right:1rem;font:400 2.3rem/1.05 var(--font-reading);letter-spacing:-.04em}
  .paper p{margin:0}.close{position:absolute;right:6px;top:3px;background:none;border:0;font-size:1.6rem;width:44px;color:var(--ink)}
  form{display:grid;gap:.8rem}textarea{resize:vertical;width:100%;padding:10px;background:#fffcf3;border:1px solid #adaa91;font:1.18rem/1.5 var(--font-reading);color:var(--ink)}
  .ink{justify-self:start;padding:8px 22px;color:#fff9e8;background:var(--ink);border:0;border-radius:3px}
  .muted,label,.place-row span{color:var(--muted);font:.9rem/1.5 var(--font-ui)}.place-row,.row{background:none;border:0;border-bottom:1px solid #cfcbb6;text-align:left;padding:5px 0 10px;color:var(--ink)}
  .place-row{display:grid;gap:3px;width:100%}.place-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.place-row strong{font:1.2rem/1.25 var(--font-reading)}
  blockquote,.prose{white-space:pre-wrap;overflow-wrap:anywhere}blockquote{margin:0 0 .5rem;font:1.27rem/1.45 var(--font-reading)}
  @media(max-width:600px){dialog{right:16px;bottom:16px;max-height:70dvh}.tools{right:12px}.tools button{padding:6px 12px}}
  @media(prefers-reduced-motion:reduce){.motion{display:none}}
</style>
