<script lang="ts">
  import { aiAvailable } from '../../../../shared/ai-release.js';
  import { onMount, tick } from 'svelte';
  import { api, isCompanion, type EntryData, type MemoirEdition, type ModelWeights } from '$lib/api.js';
  import { companionRequest } from '$lib/stores/ai.svelte.js';
  import { vaultStore } from '$lib/stores/vault.svelte.js';
  import { prependEntry } from '$lib/stores/entries.svelte.js';
  import { sessionVersion } from '$lib/session-version.js';
  import { attachPresence, birdHabit, presences, remember, reviseThread, type Trace } from '../../../../shared/village.js';
  import type { Place, walkScene } from '$lib/village/walk.js';

  let {guest=false, onExit, openArchive, busy=$bindable(false)}:{
    guest?:boolean; onExit?:()=>void; openArchive?:(section:0|1|2)=>void; busy?:boolean
  }=$props();
  type Panel='write'|'words'|'walk'|'help'|'gardener'|'bookbinder'|null;
  const names:Record<Place,string>={cabin:'The writing room',eaves:'Under the eaves',river:'The riverbank',garden:'The gardener’s lane',bindery:'The bookbinder’s porch'};
  const sample:EntryData={id:'a'.repeat(32),body:'Dad sends me the forecast every morning.',created_at:1,solidified_at:1,kept_at:null,user_id:'guest'};
  let entries=$state.raw<EntryData[]>([]), selected=$state(''), ready=$state(false);
  let place=$state<Place>('cabin'), panel=$state<Panel>(null), doorOpen=$state(false);
  let scene=$state.raw<Awaited<ReturnType<typeof walkScene>>|null>(null);
  let canvas:HTMLCanvasElement,dialog=$state<HTMLDialogElement>(), alive=false;
  let graphicsError=$state(false), error=$state(''), notice=$state(''), draft=$state(''), draftId='';
  let memoir=$state<MemoirEdition|null>(null), weights=$state<ModelWeights|null>(null), asked=$state(false), consulting=$state(false);
  let generation=0;
  let sharePage=$state(false), still=$state(false);
  const groups=$derived(presences(entries));
  const bird=$derived(groups.find(p=>p.id===selected) ?? groups.at(-1));
  const latest=$derived(bird?.entries.at(-1));
  const habit=$derived(bird?birdHabit(bird):null);
  const returning=$derived(groups.filter(g=>g.entries.length>1).sort((a,b)=>b.entries.length-a.entries.length)[0]);
  async function read(){
    try{
      const data=guest?{entries:[{...sample}]}:await api.village.get();
      if(alive){entries=data.entries;selected=entries.at(-1)?.presence??'';ready=true;error='';}
    }catch{if(alive)error='Your journal could not be opened.';}
  }
  async function graphics(){
    const current=++generation;graphicsError=false;
    try{
      const {walkScene:build}=await import('$lib/village/walk.js');
      if(!alive||current!==generation)return;
      const result=await build(canvas,arrive,interact,visitBird);
      if(!alive||current!==generation){result.destroy();return;}
      result.moveTo(place,true);scene=result;
    }catch{if(alive)graphicsError=true;}
  }
  onMount(()=>{
    alive=true;void read();void graphics();
    return ()=>{alive=false;generation++;scene?.destroy();};
  });
  $effect(()=>{scene?.update(groups,bird?.id??'',doorOpen);});
  $effect(()=>{scene?.pause(!!panel);scene?.setStill(still);});
  let walkedOutside=false;
  function arrive(next:Place){
    if(next==='eaves')walkedOutside=true;
    if(next==='cabin'){walkedOutside=false;doorOpen=false;}
    if(next==='river' && walkedOutside && latest && !doorOpen){walkedOutside=false;void trace('passed');}
    place=next;notice='';
  }
  function go(next:Place){
    if(busy)return;
    close();
    if(next==='cabin')doorOpen=false;
    if(scene)scene.moveTo(next);else arrive(next);
  }
  async function show(next:Exclude<Panel,null>){
    if(busy)return;
    notice='';asked=false;weights=null;memoir=null;panel=next;
    await tick();if(dialog&&!dialog.open)dialog.showModal();
  }
  function close(){dialog?.close();panel=null;asked=false;}
  function visitBird(id:string){
    selected=id;
    if(scene)scene.approachBird(id,()=>{void show('words');});
    else void show('words');
  }
  function interact(){
    if(place==='cabin')void show('write');
    else if(place==='garden')void show('gardener');
    else if(place==='bindery')void show('bookbinder');
    else if(bird)visitBird(bird.id);
  }
  async function trace(action:Trace){
    if(!latest || busy || latest.traces?.includes(action))return true;
    busy=true;error='';
    try{
      const data=guest?remember(structuredClone(entries),{entry:latest.id,action}):await api.village.remember(latest.id,action);
      if(alive)entries=data.entries;return true;
    }catch{if(alive)error='That moment could not be saved. Try again.';return false;}
    finally{if(alive)busy=false;}
  }
  async function revise(entry:EntryData,separate:boolean){
    if(busy)return;
    busy=true;
    try{
      const result=guest?reviseThread(structuredClone(entries),{entry:entry.id,separate}):await api.village.revise(entry.id,separate);
      if(alive){entries=result.entries;selected=entries.find(e=>e.id===entry.id)?.presence??entry.id;}
    }catch{if(alive)error='The thread could not be updated.';}
    finally{if(alive)busy=false;}
  }
  async function shelter(){
    if(busy)return;
    if(doorOpen){doorOpen=false;return;}
    const invited=bird && (habit==='lead'||habit==='return-to-door'||habit==='wait-for-you'||habit==='rest'||latest?.traces?.includes('noticed'));
    if(invited && !await trace('sheltered'))return;
    doorOpen=true;scene?.faceDoor();
  }
  async function noticeBird(){
    if(!bird || busy)return;
    scene?.lookAtBird(bird.id);
    await trace('noticed');
  }
  async function interpret(id:string,version:number){
    try{
      const {entry}=await companionRequest<{entry:EntryData}>('village/interpret','POST',{entry:id,consent:true});
      if(!alive || sessionVersion.value!==version)return;
      entries=entries.map(e=>e.id===id?{...e,presence:entry.presence,reading:entry.reading}:e);
      if(entries.at(-1)?.id===id)selected=entry.presence??id;
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
      entries=[...entries.filter(e=>e.id!==saved.id),saved];selected=saved.presence??saved.id;draft='';draftId='';doorOpen=false;
      close();notice=guest?'Page saved for this visit.':'Page saved.';
      if(aiAvailable && !guest && isCompanion && sharePage && vaultStore.status?.aiAllowed)void interpret(saved.id,version);
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

<main class="village" aria-label="Riverside village">
  <canvas bind:this={canvas} tabindex="0" aria-label="First-person village. Drag to look, use W A S D to walk or choose a place from Walk."></canvas>
  <div class="top">
    {#if guest}<button class="glass" onclick={onExit}>← Leave guest visit</button>{/if}
    <button class="glass" onclick={()=>show('walk')}>Walk</button>
    <button class="round glass motion-toggle" aria-label={still?'Resume ambient motion':'Pause ambient motion'} title={still?'Resume ambient motion':'Pause ambient motion'} onclick={()=>still=!still}><span aria-hidden="true">{still?'▷':'Ⅱ'}</span></button>
    <button class="round glass" aria-label="Walking controls" onclick={()=>show('help')}>?</button>
  </div>
  <div class="caption">
    <h1>{names[place]}</h1>
    <div class="actions">
      {#if place==='cabin'}
        <button class="primary" disabled={!ready||busy} onclick={()=>show('write')}>Open journal</button>
        <button onclick={()=>go('eaves')}>Step outside</button>
      {:else if place==='eaves'}
        <button class="primary" disabled={busy} onclick={shelter}>{doorOpen?'Close the screen':'Open the screen'}</button>
        {#if bird}<button disabled={busy} onclick={noticeBird}>Pause at the railing</button>{/if}
        <button onclick={()=>go('river')}>Walk to the river</button>
      {:else if place==='river'}
        {#if bird}<button class="primary" onclick={()=>visitBird(bird!.id)}>Sit with the bird</button>{/if}
        <button onclick={()=>go('eaves')}>Return to the eaves</button>
      {:else}<button class="primary" onclick={interact}>{place==='garden'?'Talk to the gardener':'Talk to the bookbinder'}</button>{/if}
    </div>
    <p class="status" aria-live="polite">{error||notice||(graphicsError?'The view is unavailable. You can still walk between places.':!scene?'Opening the valley…':'')}</p>
    {#if graphicsError}<button onclick={graphics}>Retry 3D</button>{/if}
    {#if !ready&&error}<button onclick={read}>Retry journal</button>{/if}
  </div>
  <dialog bind:this={dialog} oncancel={e=>{if(busy)e.preventDefault();}} onclose={()=>panel=null}>
    {#if panel}
      <div class="paper">
        <button class="dismiss" aria-label="Close" disabled={busy} onclick={close}>×</button>
        {#if panel==='write'}
          <h2>Your journal</h2>
          {#if guest}<p class="muted">Guest notebook. These pages last for this visit.</p>{/if}
          <form onsubmit={e=>{e.preventDefault();void save();}}>
            <label for="village-page">What’s on your mind?</label>
            <textarea id="village-page" bind:value={draft} oninput={()=>draftId=''} maxlength="500" rows="5" required></textarea>
            {#if aiAvailable && !guest && isCompanion && vaultStore.status?.aiAllowed}
              <label><input type="checkbox" bind:checked={sharePage}/> Let ChatGPT read this page and up to six earlier excerpts to shape its encounter.</label>
            {/if}
            <button class="ink" disabled={!draft.trim()||busy}>{busy?'Saving…':'Save page'}</button>
          </form>
        {:else if panel==='walk'}
          <h2>Take a walk</h2>
          {#each Object.keys(names) as key}<button class="row" onclick={()=>go(key as Place)}>{names[key as Place]} <span>{place===key?'Here':'↗'}</span></button>{/each}
        {:else if panel==='help'}
          <h2>Walking</h2><p>Drag to look around. Tap the ground or choose a place under Walk. On a keyboard, use W A S D to walk, the arrow keys to turn or step, and Enter to interact.</p><button class="row" aria-pressed={still} onclick={()=>still=!still}>Still movement <span>{still?"On":"Off"}</span></button><p class="muted"><a href="/town/credits.txt" target="_blank" rel="noreferrer">Village art credits</a></p>
        {:else if panel==='words' && bird}
          <h2>Beside the river bird</h2>
          {#each bird.entries as entry}
            <blockquote>{entry.body}</blockquote>
            {#if entry.previousPresence}<button class="row" disabled={busy} onclick={()=>revise(entry,false)}>Rejoin the earlier thread</button>
            {:else if entry.id!==bird.id && bird.entries.length>1}<button class="row" disabled={busy} onclick={()=>revise(entry,true)}>Keep this page apart</button>{/if}
          {/each}
          {#if groups.length>1}<label for="other-bird">Other presences</label><select id="other-bird" value={bird.id} onchange={e=>{selected=e.currentTarget.value;scene?.lookAtBird(selected);}}>{#each groups as group}<option value={group.id}>{group.entries[0]?.body.slice(0,64)}</option>{/each}</select>{/if}
        {:else if panel==='gardener'}
          <h2>The gardener</h2>
          <button class="row" disabled={consulting} onclick={ask}>What keeps returning in my writing?</button>
          {#if asked}
            {#if weights?.emerging_theme}<p>{weights.emerging_theme}</p>{/if}
            {#if returning}<p>These pages return to the same thread.</p>{#each returning.entries.slice(-3) as entry}<blockquote>{entry.body}</blockquote>{/each}
            {:else}<p>I haven’t found a recurring thread in these pages yet.</p>{/if}
            {#if !guest && isCompanion}<button class="row" onclick={()=>openArchive?.(1)}>Read the six lenses ↗</button>{/if}
          {/if}
        {:else if panel==='bookbinder'}
          <h2>The bookbinder</h2>
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
  .village{height:100%;width:100%;position:relative;overflow:hidden;background:#66766b url('/town/valley-painting.webp') center/cover}
  canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}canvas:active{cursor:grabbing}
  .top{position:absolute;top:clamp(12px,2.7vw,34px);right:var(--gutter);display:flex;gap:8px}
  button,select{font:500 .94rem/1.4 var(--font-ui);cursor:pointer}
  .glass,.actions button,.caption>button{border:1px solid #d9d6c2;background:#f4f1dfed;color:#273c33;border-radius:4px;padding:9px 17px;min-height:44px}
  @media(prefers-reduced-motion:reduce){.motion-toggle{display:none}}
  .round{width:44px;padding:0;border-radius:50%}
  .caption{position:absolute;inset:auto 0 0;color:#fff9e4;padding:4rem var(--gutter) clamp(15px,3vw,40px);pointer-events:none;background:linear-gradient(transparent,#161f1ac9)}
  .caption button{pointer-events:auto}.caption h1{font:400 clamp(2.5rem,5vw,5.1rem)/1 var(--font-reading);letter-spacing:-.055em;margin:0 0 17px;text-shadow:0 1px 8px #1b201d70}
  .actions{display:flex;gap:9px;flex-wrap:wrap}.actions .primary{background:#f9f3db;color:#243a30}
  .actions button:not(.primary){background:#263931ce;color:#fff8df;border-color:#c5c5ac77}
  .status{font:.9rem var(--font-ui);margin-top:8px}.status:empty{display:none}
  dialog{inset:0;margin:auto;width:min(92vw,34rem);max-height:85dvh;border:1px solid #b1a989;border-radius:8px;background:#f5efd9;color:#293d32;box-shadow:0 24px 80px #141d1b4a}
  dialog::backdrop{background:#18282065;backdrop-filter:blur(3px)}
  .paper{position:relative;display:grid;gap:1.1rem;padding:clamp(25px,5vw,52px)}
  h2{padding-right:22px;font:400 2.6rem/1.05 var(--font-reading);letter-spacing:-.045em}
  .dismiss{position:absolute;right:9px;top:7px;border:0;background:none;color:var(--ink);font-size:1.5rem;width:44px;height:44px}
  form{display:grid;gap:12px}label,.muted{font:.95rem/1.5 var(--font-ui);color:var(--muted)}
  textarea,select{width:100%;border:1px solid #a09e87;border-radius:3px;color:var(--ink);background:#fffcf0;padding:.8rem}
  textarea{font:1.25rem/1.6 var(--font-reading);resize:vertical}
  .ink{justify-self:start;background:var(--ink);color:var(--paper);border:0;border-radius:4px;min-height:44px;padding:8px 20px}
  .row{display:flex;justify-content:space-between;align-items:center;background:none;border:0;border-bottom:1px solid #c3c2aa;min-height:44px;color:var(--ink);text-align:left}
  .row span{color:var(--muted);font-size:.82rem}blockquote{font:1.2rem/1.55 var(--font-reading);padding-left:1rem;border-left:2px solid #aaa98c;white-space:pre-wrap;overflow-wrap:anywhere}.prose{white-space:pre-wrap}
  @media(max-width:600px){.caption{padding-top:2rem}.actions{gap:6px}.actions button{font-size:.85rem;padding:8px 12px}.top{right:12px}}
</style>
