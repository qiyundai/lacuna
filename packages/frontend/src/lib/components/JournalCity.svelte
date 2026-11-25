<script lang="ts">
  import MonumentPostcard from './MonumentPostcard.svelte';
  import { postcardEdition, writingWeeks } from '../../../../shared/monuments.js';
  import IconAction from './IconAction.svelte';
  import Icon from './Icon.svelte';
  import SoundToggle from './SoundToggle.svelte';
  import NowPlaying from './NowPlaying.svelte';
  import { musicWindow } from '$lib/music-window.svelte.js';
  import { activateValleyAudio, enterValley, leaveValley, toggleValleySound, valleyAudioContext, valleyPlayback } from '$lib/valley-playback.svelte.js';
  import { onMount, tick, untrack, type Snippet } from 'svelte';
  import Masthead from './Masthead.svelte';
  import ValleyLoading from './ValleyLoading.svelte';
  import { api, type EntryData } from '$lib/api.js';
  import { sessionVersion } from '$lib/session-version.js';
  import { prependEntry } from '$lib/stores/entries.svelte.js';
  import { resetJournalData } from '$lib/stores/session.svelte.js';
  import { currentRiverEdition, forgetAddress, type ForgottenAddress } from '../../../../shared/city-address.js';
  import { siteName } from '$lib/town/architecture-catalog.js';
  import { exampleJournal } from '$lib/town/example-journal.js';
  import type { LightBudget } from '$lib/town/light-budget.js';
  import { paintedCoast, type Site } from '$lib/town/painted-coast.js';
  import { journalDetails } from '$lib/town/journal-details.js';
  import type { SceneCues } from '$lib/town/journal-scenes.js';
  import type { createHarbor } from '$lib/town/harbor.js';

  import type { PageMarker } from '$lib/town/city-page-markers.js';
  import { residentHomes, type ResidentVisit } from '$lib/town/resident-lives.js';

  import { lifeStories } from '$lib/town/life-stories.js';
  import { emptyCensus, housedResidents, citizenLife, type Census } from '$lib/town/citizens.js';
  let census=$state.raw<Census>(emptyCensus()), now=$state(Math.floor(Date.now()/1000)), query=$state('');
  let {guest=false,readOnly=false,exampleHomes=residentHomes,lightBudget,afterglow=false,fixedHour,onExit,navigation,draft=$bindable(''),draftId=$bindable(''),busy=$bindable(false)}:{guest?:boolean;readOnly?:boolean;exampleHomes?:typeof residentHomes;lightBudget?:LightBudget;afterglow?:boolean;fixedHour?:number;onExit?:()=>void;navigation?:Snippet;draft?:string;draftId?:string;busy?:boolean}=$props();
  let canvas:HTMLCanvasElement,dialog:HTMLDialogElement;
  let postcard=$state<MonumentPostcard>();
  let postcardRead=$state(0), postcardOpen=$state(false);
  async function markPostcardRead(){
    const seen=edition,version=sessionVersion.value;
    if(postcardRead>=seen)return;
    if(guest){postcardRead=seen;return;}
    try{
      const read=await api.city.readPostcard(seen);
      if(alive && sessionVersion.value===version)postcardRead=Math.max(postcardRead,read);
    }catch{if(alive && sessionVersion.value===version)notice='Could not mark the postcard as read.';}
  }
  let pageOpen=$state(false),closing=$state(false);
  let dialogRevision=0;
  let opener:HTMLElement|null=null;
  let pageTurn:Animation|undefined;
  function syncSound(){
    scene?.setSound(valleyAudioContext(),valleyPlayback.ambience&&!valleyPlayback.muted,pageOpen||postcardOpen);
  }
  let entries=$state.raw<EntryData[]>([]),scene=$state.raw<Awaited<ReturnType<typeof createHarbor>>|null>(null);
  let forgotten=$state.raw<ForgottenAddress[]>([]);
  const weeks=$derived(writingWeeks([...entries,...forgotten]));
  const edition=$derived(postcardEdition(weeks));
  let ready=$state(false),paused=$state(false),graphicsError=$state(false),error=$state(''),notice=$state('');
  let readId=$state('');
  let markers=$state.raw<PageMarker[]>([]),writingDate=$state(new Date());
  const valleyViews=['City','Overlook'] as const;
  let panel=$state<'write'|'pages'|'read'|'forget'|'resident'|'directory'>('write'),alive=false;
  let resident=$state.raw<ResidentVisit>(),openedResident=$state.raw<ResidentVisit>();
  let recipeNote=$state('');
  let savedPage:string|undefined;
  const ordered=$derived([...entries].sort((a,b)=>b.created_at-a.created_at||b.id.localeCompare(a.id)));
  const seen = new WeakMap<EntryData, SceneCues>();
  const plan=$derived.by(()=>{
    const coast = paintedCoast(entries,forgotten);
    return {...coast, details: journalDetails(coast,entries,seen), homes:guest?exampleHomes(coast,entries,true):housedResidents(census,coast,entries)};
  });
  $effect(()=>{
    const deadlines=guest?plan.homes.map(h=>h.arrival):census.people.flatMap(p=>p.slot && p.chapters.length<3?[p.arrival,p.next]:[p.arrival]);
    const next=deadlines.reduce((best,t)=>t>now?Math.min(t,best):best,Infinity);
    if(!Number.isFinite(next))return;
    const timer=setTimeout(()=>{now=Math.floor(Date.now()/1000);if(!guest)void read();},Math.min(2147483000,Math.max(0,next*1000-Date.now()+50)));
    return ()=>clearTimeout(timer);
  });
  const portrait=(model?:string)=>model && model!=='market-shopper.glb'
    ? '/city/residents/portraits/'+model.replace(/\.glb$/,'.webp') : '/city/residents/tomas.webp';
  const directory=$derived.by(()=>{
    const housed=new Map(plan.homes.map(h=>[h.resident,h]));
    const people=guest?plan.homes.map(h=>({id:h.resident,name:h.life.name,arrival:h.arrival,model:h.life.model})):
      census.people.map(p=>({id:p.id,name:p.name,arrival:p.arrival,model:lifeStories[p.family]?.model}));
    return people.filter(p=>p.arrival<=now).map(p=>({...p,place:housed.get(p.id)?.site})).sort((a,b)=>a.name.localeCompare(b.name));
  });
  const searchKey=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').trim().toLocaleLowerCase();
  let directoryLimit=$state(60);
  const matches=$derived(directory.filter(p=>searchKey(p.name+' '+(p.place?siteName(p.place.kind):'Between homes')).includes(searchKey(query))));
  function meet(id:string){
    const visit=scene?.visitResident(id);
    if(visit)resident=visit;
    else{
      const person=census.people.find(p=>p.id===id);
      if(!person)return;
      const site=plan.homes.find(h=>h.resident===id)?.site;
      resident={life:citizenLife(person,site),site,task:site?'At '+siteName(site.kind):'Between homes',stops:[]};
    }
    void open('resident');
  }
  const openedPage=$derived(entries.find(entry=>entry.id===readId));
  const site=$derived(plan.addresses.get(readId));
  const neighbors=$derived(site?ordered.filter(page=>plan.addresses.get(page.id)===site):[]);
  const room=$derived(neighbors.findIndex(page=>page.id===readId));
  const folios=$derived(new Map([...entries,...forgotten].sort((a,b)=>a.created_at-b.created_at||a.id.localeCompare(b.id)).map((page,i)=>[page.id,i+1])));
  const fullDate=new Intl.DateTimeFormat(undefined,{month:'long',day:'numeric',year:'numeric'});
  const weekday=new Intl.DateTimeFormat(undefined,{weekday:'long'});
  const opening=$derived((!ready||!scene)&&!error&&!graphicsError);
  const statusLine=$derived(error||(graphicsError?'City view unavailable. Your journal is open.':notice||(!entries.length&&ready?(forgotten.length?'No pages left to read.':'Your first page begins the city.'):'')));
  const date=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'});
  let readRequest=0;
  async function read(){
    const request=++readRequest, version=sessionVersion.value;
    try{
      const journal=guest?{entries:exampleJournal(),postcardRead,forgotten:[],census:emptyCensus()}:await api.city.get();
      if(!alive || request!==readRequest || version!==sessionVersion.value)return;
      entries=journal.entries;forgotten=journal.forgotten;postcardRead=Math.max(postcardRead,journal.postcardRead??0);census=journal.census;now=Math.floor(Date.now()/1000);
      ready=true;error='';
      if(readId && !entries.some(e=>e.id===readId)){readId='';dialog?.close();}
    }
    catch{if(alive && request===readRequest){entries=[];forgotten=[];ready=false;readId='';dialog?.close();error='Your journal could not be opened.';}}
  }
  function refreshCity(event:Event){
    if(busy && event instanceof CustomEvent && event.detail?.saved)return;
    void read();
  }
  async function graphics(){
    graphicsError=false;
    try{
      const {createHarbor}=await import('$lib/town/harbor.js');
      if(!alive)return;
      const city=await createHarbor(canvas,readPage,afterglow,next=>{if(alive)markers=next;},fixedHour,visit=>{if(alive)resident=visit;},meet,lightBudget);
      if(alive)scene=city;else city.destroy();
    }catch{if(alive)graphicsError=true;}
  }
  onMount(()=>{
    alive=true;const preference=matchMedia('(prefers-reduced-motion: reduce)');
    enterValley();
    const events=new AbortController();
    window.addEventListener('lacuna:valley-audio',syncSound,{signal:events.signal});
    const retrySound=(event:Event)=>{
      if(event.isTrusted && !(event instanceof KeyboardEvent && ['Control','Alt','Meta','Shift','Escape'].includes(event.key)))activateValleyAudio();
    };
    window.addEventListener('click',retrySound,{signal:events.signal});
    window.addEventListener('keydown',retrySound,{signal:events.signal});
    const sync=()=>{paused=preference.matches;};sync();preference.addEventListener('change',sync);
    void read();void graphics();
    if(!guest)window.addEventListener('lacuna:journal-changed',refreshCity);
    return ()=>{alive=false;events.abort();preference.removeEventListener('change',sync);window.removeEventListener('lacuna:journal-changed',refreshCity);scene?.destroy();leaveValley();};
  });
  $effect(syncSound);
  $effect(()=>{
    if(!notice)return;
    const timer=setTimeout(()=>notice='',5500);
    return ()=>clearTimeout(timer);
  });
  $effect(()=>{scene?.pause(paused);});
  $effect(()=>{
    if(!scene||graphicsError)return;
    untrack(()=>musicWindow.scenes++);
    return ()=>untrack(()=>{musicWindow.scenes--;});
  });
  $effect(()=>{
    if(scene){scene.update(plan,savedPage);savedPage=undefined;}
  });

  async function dismiss(){
    if(!dialog.open || closing)return;
    const revision=++dialogRevision;
    closing=true;
    await tick();
    await Promise.allSettled(dialog.getAnimations().map(animation=>animation.finished));
    if(alive && revision===dialogRevision && dialog.open){
      dialog.close();
      pageOpen=false;
      closing=false;
    }
  }

  function restoreFocus(){
    if(dialog.open)return;
    pageOpen=false;
    closing=false;
    if(opener?.isConnected && opener.getClientRects().length && !opener.matches(':disabled'))opener.focus({preventScroll:true});
    if(document.activeElement===document.body)canvas.focus({preventScroll:true});
  }
  async function open(which:typeof panel, direction=which==='pages'?-1:1){
    if(busy || (readOnly && (which==='write' || which==='forget')))return;
    const revision=++dialogRevision;
    const turn=dialog.open && !closing;
    if(!dialog.open)opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    closing=false;
    pageTurn?.cancel();
    panel=which;error='';if(which==='directory'){query='';directoryLimit=60;}if(which==='write')writingDate=new Date();
    if(which==='resident' && resident){
      openedResident=resident;
      const notes=resident.life.notes;
      recipeNote=notes[new Date().getDay()%notes.length]!;
    }
    await tick();if(!alive || revision!==dialogRevision)return;
    if(!dialog.open)dialog.showModal();
    if(turn && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      pageTurn=dialog.querySelector('.page-copy')?.animate([
        {opacity:.3,transform:'perspective(500px) translateX('+direction*8+'px) rotateY('+direction*5+'deg)'},
        {opacity:1,transform:'none'}
      ],{duration:180,easing:'ease-out'});
    }
    pageOpen=true;
    dialog.scrollTop=0;
    dialog.querySelector<HTMLElement>(which==='directory'?'input[type=search]':which==='write'?'textarea':which==='forget'?'[data-keep-page]':'#journal-heading')?.focus({preventScroll:true});
  }
  function readPage(id:string,direction=1){
    if(busy)return;
    readId=id;scene?.visit('Page',id);void open('read',direction);
  }
  async function forgetPage(){
    if(busy || closing || panel!=='forget' || !openedPage)return;
    const id=openedPage.id,version=sessionVersion.value;
    busy=true;error='';
    try{
      const address=guest?forgetAddress(entries,forgotten,entries.findIndex(e=>e.id===id)):(await api.entries.forget(id)).address;
      if(!alive||version!==sessionVersion.value)return;
      if(!guest)resetJournalData();
      await dismiss();
      if(!alive||version!==sessionVersion.value)return;
      forgotten=[...forgotten.filter(a=>a.id!==id),address].sort((a,b)=>a.position-b.position);
      entries=entries.filter(e=>e.id!==id);if(!guest)await read();
      readId='';notice='Page forgotten. Its address remains.';
    }catch{error='Could not forget this page. Try again.';}
    finally{if(alive)busy=false;}
  }
  async function save(){
    const body=draft.trim();if(!body||busy||closing||!ready)return;
    draftId ||= crypto.randomUUID().replaceAll('-','');
    const version=sessionVersion.value;busy=true;error='';
    try{
      const now=Math.floor(Date.now()/1000);
      const {entry,created}=guest?{created:true,entry:{id:draftId,riverEdition:currentRiverEdition,body,user_id:'guest',created_at:now,solidified_at:now,kept_at:null}}:await api.city.write(body,now,draftId);
      if(!alive||version!==sessionVersion.value)return;
      if(!guest)prependEntry(entry);
      await dismiss();
      if(!alive||version!==sessionVersion.value)return;
      savedPage=created && !entries.some(page=>page.id===entry.id)?entry.id:undefined;
      entries=[...entries.filter(e=>e.id!==entry.id),entry];draft='';draftId='';
      if(!guest)await read();
      await tick();
      const home=plan.addresses.get(entry.id);
      notice=home?'Page saved at '+siteName(home.kind).replace(/^The /,'the ')+'.':'Page saved.';
    }catch{if(alive)error='Your writing is still here. Try saving again.';}
    finally{if(alive)busy=false;}
  }
</script>

{#snippet soundToggles()}
  <IconAction icon="music" label="Soundtrack" pressed={valleyPlayback.music} onclick={()=>toggleValleySound('music')}/>
  {#if scene}<IconAction icon="ambience" label="Ambience" pressed={valleyPlayback.ambience} onclick={()=>toggleValleySound('ambience')}/>{/if}
{/snippet}
<!-- While the listening room is open the city is its backdrop: everything laid over the canvas steps aside -->
<main class="coast" class:listening={musicWindow.mode==='room'} aria-label="Journal city">
  <canvas bind:this={canvas} inert={opening} tabindex="0" aria-label="A city growing along the valley river. Drag or use arrow keys to orbit, right-drag to pan, and scroll or pinch to zoom. Home returns to the city. Select a building to read its page or a resident to meet them."></canvas>
  {#if ready && scene}
    {#each markers as marker,i (marker.id)}
      {@const marked=plan.addresses.get(marker.id)}
      {#if marked}
        <button class="page-marker" class:featured={i===0} style:left={marker.x+'px'} style:top={marker.y+'px'}
          data-page-marker aria-label={'Read page '+folios.get(marker.id)+' at '+siteName(marked.kind)} onclick={()=>readPage(marker.id)}>
          <span class="marker-face"><svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M10 6Q7 3 2 4v11q5-1 8 2 3-3 8-2V4q-5-1-8 2Zm0 0v11"/></svg><span class="marker-label">Read page</span></span>
        </button>
      {/if}
    {/each}
  {/if}
  {#if opening}<ValleyLoading audio label={ready?'Opening the valley…':'Opening your journal…'} onExit={guest?onExit:undefined}/>{/if}
  <h1 class="visually-hidden" tabindex="-1">{guest?'Example city':'Your city'}</h1>
  {#if !opening}
    <Masthead floating audio journalMenu unread={ready && edition>postcardRead} sound={soundToggles} disabled={busy} world={guest?'Example city':'Your city'} pageCount={entries.length}>
      <IconAction icon="pages" label="Pages" onclick={()=>open('pages')} disabled={!ready}/>
      {#if ready && edition}<IconAction icon="postcard" label="A postcard" unread={edition>postcardRead} onclick={()=>postcard?.show()}/>{/if}
      {#if scene}
        {#each valleyViews as view}
          <IconAction icon={view==='City'?'city':'overlook'} label={view==='City'?'City view':view} onclick={()=>scene?.visit(view)}/>
        {/each}
        <IconAction icon={paused?'play':'pause'} label={paused?'Resume ambient motion':'Pause ambient motion'} onclick={()=>paused=!paused}/>
      {/if}
      {#if directory.length}<IconAction icon="resident" label="Residents" onclick={()=>open('directory')}/>{/if}
      {@render navigation?.()}
      {#if guest}
        <IconAction icon="leave" label="Leave visit" onclick={onExit}/>
      {/if}
    </Masthead>
    <div class="bottom">
      <!-- Bottom-left: a notice when there is one, otherwise the song that is playing -->
      <div class="lead"><p class="status" role="status">{statusLine}</p>
        {#if resident}
          <button class="resident-card" onclick={()=>open('resident')} aria-label={'Read the story of '+resident.life.name}>
            <Icon name="pages"/><span><strong>{resident.life.name}</strong><small>{resident.task}</small></span>
          </button>
        {:else if !statusLine}<NowPlaying/>{/if}
      </div>
      <div class="actions">
        {#if graphicsError}<IconAction icon="retry" label="Retry city" onclick={graphics}/>{/if}
        {#if !ready&&error}<IconAction icon="retry" label="Retry journal" onclick={read}/>{/if}
        {#if !readOnly}<IconAction tone="raised" icon="write" label={draft?'Return to draft':'Write a page'} disabled={!ready||busy} onclick={()=>open('write')}/>{/if}
      </div>
    </div>
  {/if}
  {#if ready && edition}<MonumentPostcard bind:this={postcard} {weeks} canVisit={!!scene} onopen={value=>postcardOpen=value} onread={markPostcardRead} onvisit={id=>scene?.visitMonument(id)}/>{/if}
  <dialog bind:this={dialog} class:closing class:browsing={panel==='pages'||panel==='read'} aria-labelledby="journal-heading" oncancel={e=>{e.preventDefault();if(!busy)void dismiss();}}
    onclose={restoreFocus}>
    <div class="folio" class:directory-sheet={panel==='directory'} class:reading={panel==='read'||panel==='forget'||panel==='resident'}>
      {#if panel!=='directory'}
      <aside class="cover" aria-label={site && (panel==='read'||panel==='forget')?'Page location':'Journal cover'}>
        {#if (panel==='read'||panel==='forget') && site}
          <div class="plate">
            {#if site.elevation !== undefined}
              <svg viewBox={`${site.elevation % 3} ${Math.floor(site.elevation / 3)} 1 1`} aria-hidden="true">
                <image href={'/city/paint/'+site.kind+'.webp'} width="3" height="2"/>
              </svg>
            {:else}
              <img src={'/city/paint/'+site.kind+'.webp'} alt=""/>
            {/if}
          </div>
          <div class="imprint"><span>{site.bank===0?'West bank':'East bank'}</span><strong>{siteName(site.kind)}</strong></div>
        {:else if panel==='resident' && openedResident}
          <div class="plate">
            <img src={portrait(openedResident.life.model)} alt="" width="384" height="384"/>
          </div>
          <div class="imprint"><span>{openedResident.life.tomas?'Harbor resident':openedResident.site?siteName(openedResident.site.kind):'Between homes'}</span><strong>{openedResident.life.name}</strong></div>
        {:else}
          <div class="imprint"><span>{guest?'Example journal':'City journal'}</span><strong>Lacuna</strong></div>
        {/if}
      </aside>
      {/if}
      <div class="leaf">
        <header class="leaf-head">
          <span>{panel==='directory'?'City directory':panel==='resident'?openedResident?.life.heading:panel==='write'?'Page '+(folios.size+1):panel==='pages'?'Journal index':'Page '+(folios.get(readId)??'')}</span>
          <div class="leaf-tools">
            <SoundToggle surface="paper"/>
            <button class="paper-control" aria-label="Close" disabled={busy} onclick={dismiss}><Icon name="close"/></button>
          </div>
        </header>
        {#if panel==='resident' && openedResident}
          <h2 id="journal-heading" tabindex="-1">{openedResident.life.title}</h2>
          <div class="resident-story"><small>{openedResident.task}</small>
            {#each openedResident.life.paragraphs as paragraph}<p>{paragraph}</p>{/each}
            {#if openedResident.memory}<p>{openedResident.memory}</p>{/if}
            {#if !openedResident.life.tomas && openedResident.stops.length}
              <h3>Regular stops</h3>
              <ul>{#each openedResident.stops as stop}<li>{stop}</li>{/each}</ul>
            {/if}
            <blockquote>{recipeNote}</blockquote>
          </div>
        {:else if panel==='directory'}
          <h2 id="journal-heading" tabindex="-1">Residents</h2>
          <search class="field" aria-labelledby="journal-heading">
            <label for="resident-search">Search residents</label>
            <div class="resident-search">
              <span aria-hidden="true"><Icon name="search" size={18}/></span>
              <input type="search" id="resident-search" placeholder="Name or building" autocomplete="off"
                spellcheck="false" {...{autocorrect:'off'}} autocapitalize="none" bind:value={query} oninput={()=>directoryLimit=60}/>
            </div>
          </search>
          <div class="resident-grid">
            {#each matches.slice(0,directoryLimit) as person (person.id)}
              <button class="directory-card" onclick={()=>meet(person.id)}>
                <img src={portrait(person.model)} alt="" width="64" height="64" loading="lazy"/>
                <span><strong>{person.name}</strong><small>{person.place?siteName(person.place.kind):'Between homes'}</small></span>
              </button>
            {:else}<p>No residents match your search.</p>{/each}
            {#if matches.length>directoryLimit}<button class="atlas-link" onclick={()=>directoryLimit+=60}>Show more residents</button>{/if}
          </div>
        {:else if panel==='write'}
          <h2 id="journal-heading" tabindex="-1">A new page</h2>
          <time datetime={writingDate.toISOString()}>{weekday.format(writingDate)}, {fullDate.format(writingDate)}</time>
          <form onsubmit={event=>{event.preventDefault();void save();}}>
            <label class="visually-hidden" for="entry">Your journal entry</label>
            <textarea spellcheck="false" {...{autocorrect:'off'}} writingsuggestions="false" autocomplete="off" id="entry" rows="5" maxlength="500" required placeholder="What would you like to remember?" bind:value={draft}
              oninput={()=>draftId=''} onkeydown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.isComposing){e.preventDefault();void save();}}}></textarea>
            <div class="leaf-foot"><span class="count" aria-label={draft.length+' of 500 characters'}>{draft.length} / 500</span>
              <button disabled={busy||!ready||!draft.trim()} class="atlas-primary">{busy?'Saving…':'Save page'}</button></div>
          </form>
        {:else if panel==='forget' && openedPage}
          <h2 id="journal-heading">Forget this page?</h2>
          <p>This removes the words from your active journal. {neighbors.length>1?'The other pages at this address will stay.':'The building will stay, and its lights will go out.'}</p>
          {#if !guest}<p class="note">Related readings will disappear. Earlier backups and exports can still contain the page.</p>{/if}
          <div class="leaf-foot">
            <button class="atlas-link" data-keep-page disabled={busy} onclick={()=>open('read')}>Keep this page</button>
            <button class="atlas-primary danger" disabled={busy} onclick={forgetPage}>{busy?'Forgetting…':'Forget page'}</button>
          </div>
        {:else if panel==='read' && openedPage}
          <div class="page-copy">
            <h2 id="journal-heading" tabindex="-1">{weekday.format(openedPage.created_at*1000)}</h2>
            <time datetime={new Date(openedPage.created_at*1000).toISOString()}>{fullDate.format(openedPage.created_at*1000)}</time>
            <p class="entry-body">{openedPage.body}</p>
          </div>
          <div class="leaf-foot">
            {#if neighbors.length>1}
              <nav class="turns" aria-label="Pages at this building">
                <button class="paper-control" aria-label="Previous page at this building" disabled={room<=0} onclick={()=>readPage(neighbors[room-1]!.id,-1)}><Icon name="chevron-left"/></button>
                <span>{room+1} of {neighbors.length} here</span>
                <button class="paper-control" aria-label="Next page at this building" disabled={room>=neighbors.length-1} onclick={()=>readPage(neighbors[room+1]!.id)}><Icon name="chevron-right"/></button>
              </nav>
            {/if}
            <button class="atlas-link push" onclick={()=>open('pages')}>All pages</button>
          </div>
          {#if !readOnly}<button class="atlas-link subtle forget" onclick={()=>open('forget')}>Forget this page</button>{/if}
        {:else}
          <div class="page-copy">
            <h2 id="journal-heading" tabindex="-1">Your pages</h2>
            <div class="index">
              {#each ordered as page (page.id)}
                <article>
                  <button class="index-entry" onclick={()=>readPage(page.id)}>
                    <time datetime={new Date(page.created_at*1000).toISOString()}>{date.format(page.created_at*1000)}</time>
                    <span>{page.body}</span>
                  </button>
                  {#if scene && plan.addresses.has(page.id)}<button class="atlas-link subtle visit-site" onclick={()=>{void dismiss();scene?.visit('Page',page.id);}}>Visit in city ↗</button>{/if}
                </article>
              {:else}<p>Your saved pages will appear here.</p>{/each}
            </div>
          </div>
        {/if}
        {#if guest && !readOnly}<p class="note">{panel==='read'?'Example journal. ':''}Changes last for this visit.</p>{/if}
        {#if error}<p role="alert">{error}</p>{/if}
      </div>
    </div>
  </dialog>
</main>
<style>
  /* Sky gradient is a pre-render placeholder painted to match the scene, not UI color */
  .coast{position:relative;height:100%;min-height:0;overflow:hidden;color:var(--scene-ink);background:linear-gradient(#8c8395,#3d5466)}
  canvas{content-visibility:auto;contain-intrinsic-size:auto 700px;width:100%;height:100%;display:block;touch-action:none;cursor:grab}canvas:active{cursor:grabbing}
  .coast > :global(:not(canvas,dialog)){transition:opacity var(--dur-slow) var(--ease-soft),visibility 0s}
  .listening > :global(:not(canvas,dialog)){opacity:0;visibility:hidden;transition:opacity var(--dur-base) var(--ease-soft),visibility 0s var(--dur-base)}
  .bottom{position:absolute;inset:auto var(--gutter) var(--edge-bottom);display:flex;align-items:flex-end;justify-content:space-between;gap:var(--space-3);pointer-events:none}
  .actions{margin-left:auto;display:grid;justify-items:end;gap:var(--control-gap);pointer-events:none}
  button{min-height:var(--control);cursor:pointer}
  button:disabled{cursor:default}
  .lead{flex:0 1 auto;min-width:0;max-width:calc(100% - var(--control) - 8rem);pointer-events:none}
  .lead:has(.resident-card){max-width:min(100%,23rem)}
  .resident-card{pointer-events:auto;display:flex;align-items:center;gap:.75rem;text-align:left;padding:.55rem .9rem;color:var(--scene-ink);background:var(--scene-shade);border:1px solid var(--scene-focus);border-radius:var(--radius-s)}
  .resident-card span{display:grid;gap:.15rem}.resident-card strong{font:500 var(--ui-md)/1.3 var(--font)}.resident-card small{font:var(--ui-sm)/1.4 var(--font)}
  .resident-story p,.resident-story blockquote{margin:1em 0;line-height:1.55}
  .resident-story blockquote{padding-inline-start:1em;border-inline-start:2px solid var(--line);font-style:italic}
  .status{margin:0;padding-block:.6rem;color:var(--scene-ink);text-shadow:var(--scene-type-shadow);font:var(--ui-md)/1.4 var(--font)}.status:empty{display:none}

  /* Page markers over the city */
  .page-marker{position:absolute;transform:translate(-50%,-100%);height:49px;min-width:var(--control);padding:0 3px 13px;display:grid;place-items:center;background:transparent;border:0;color:var(--scene-ink)}
  .page-marker::after{content:'';position:absolute;bottom:0;height:13px;width:1px;background:var(--scene-ink);box-shadow:0 1px 2px var(--scene-shade)}
  .marker-face{display:flex;align-items:center;gap:6px;padding:7px;border:1px solid var(--scene-focus);border-radius:var(--radius-pill);background:color-mix(in srgb,var(--scene-shade) 94%,transparent);box-shadow:0 2px 7px color-mix(in srgb,var(--scene-shade) 50%,transparent)}
  .marker-label{display:none;font:400 var(--ui-xs) var(--font);white-space:nowrap}
  .featured .marker-face,.page-marker:is(:hover,:focus-visible) .marker-face{padding-inline:10px;background:var(--scene-raised);color:var(--scene-on-raised)}
  .featured .marker-label,.page-marker:is(:hover,:focus-visible) .marker-label{display:block}
  .page-marker:focus-visible{outline:0}
  .page-marker:focus-visible .marker-face{outline:var(--focus-width) solid var(--scene-focus);outline-offset:var(--focus-offset)}

  /* The journal: a two-leaf book on paper */
  dialog{position:fixed;inset:0;margin:auto;width:min(50rem,calc(100% - 2rem));max-height:88dvh;padding:0;border:0;border-radius:var(--radius-s);color:var(--ink);background:var(--paper);overflow:auto;overscroll-behavior:contain;box-shadow:var(--shadow-sheet)}
  dialog.browsing{height:min(36rem,88dvh)}
  .browsing .folio{min-height:100%}
  dialog::backdrop{background:var(--scene-backdrop)}
  .folio{display:grid;grid-template-columns:minmax(10rem,.52fr) minmax(0,1fr);min-height:26rem}
  .cover{display:flex;flex-direction:column;justify-content:flex-end;position:relative;isolation:isolate;background:var(--scene-shade) url('/city/valley-print.webp') 56% center/cover;color:var(--scene-ink)}
  .cover::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(0deg,color-mix(in srgb,var(--scene-shade) 96%,transparent),transparent 66%);box-shadow:inset -6px 0 10px -7px var(--scene-shade)}
  .imprint{padding:1.65rem 1.4rem;display:grid;gap:2px}
  .imprint span,.leaf-head,.count,.turns span,.note,time{font:var(--ui-sm)/1.45 var(--font)}
  .imprint strong{font:400 var(--display-2)/var(--lh-display) var(--font);letter-spacing:var(--ls-display)}
  .reading .cover{background:var(--line);color:var(--ink);justify-content:center}
  .reading .cover::after{background:none}
  .plate svg{width:min(100%,15rem);aspect-ratio:1;margin-inline:auto}
  .plate{margin:.8rem .5rem 0}.plate img{width:100%;height:auto}.plate :is(img,svg){display:block;max-height:15rem;object-fit:contain;filter:drop-shadow(0 5px 3px color-mix(in srgb,var(--ink) 13%,transparent))}
  .reading .imprint{padding:1rem 1.35rem 1.5rem}
  .leaf{min-width:0;display:flex;flex-direction:column;padding:var(--space-5) var(--sheet-inset) var(--space-6);background:linear-gradient(90deg,color-mix(in srgb,var(--line) 45%,transparent),transparent 15px)}
  .leaf-head,.leaf-foot{display:flex;justify-content:space-between;align-items:center;gap:var(--space-4)}
  .leaf-head{color:var(--ink-muted);margin-bottom:var(--space-5)}
  /* Pull the tools out by half the hit-area padding so the × lines up with the text edge */
  .leaf-tools{display:flex;margin-right:calc((var(--icon) - var(--control)) / 2)}
  .leaf h2{font:400 var(--display-2)/var(--lh-display) var(--font);letter-spacing:var(--ls-display);margin-bottom:var(--space-2)}
  .folio.directory-sheet{display:block}
  .directory-sheet .leaf{background:var(--paper);container:directory / inline-size}
  .resident-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,13rem),1fr));gap:var(--space-2);margin-top:var(--space-4)}
  .directory-card{display:flex;align-items:center;gap:.72rem;padding:.5rem;text-align:start;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:var(--radius-s)}
  .directory-card img{display:block;flex:none;width:3.55rem;height:3.55rem;object-fit:cover;border-radius:var(--radius-s);background:var(--valley)}
  .directory-card span{min-width:0;display:grid;gap:.18rem;overflow-wrap:anywhere}
  .directory-card strong{font:600 var(--text-md)/1.16 var(--font)}
  .directory-card small{font:400 var(--ui-sm)/1.25 var(--font);color:var(--ink-muted)}
  .directory-card:is(:hover,:focus-visible){background:var(--field);border-color:var(--accent)}
  .directory-card:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
  .resident-grid>.atlas-link,.resident-grid>p{grid-column:1/-1}
  @container directory (max-width:29rem){
    .resident-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,8rem),1fr))}
    .directory-card{align-items:flex-start;flex-direction:column;padding:.72rem}
  }
  .resident-search{position:relative}
  .resident-search span{position:absolute;inset-inline-start:0;top:50%;translate:0 -50%;display:flex;color:var(--ink-muted);pointer-events:none}
  .resident-search input{padding-inline-start:var(--space-6)}
  .leaf time,.count,.note{color:var(--ink-subtle)}
  form{display:flex;flex-direction:column;gap:var(--space-5);flex:1;margin-top:var(--space-6)}
  textarea{width:100%;min-height:7.5rem;resize:vertical;border:0;border-radius:0;padding:0 .2rem;color:var(--ink);caret-color:var(--accent);font:400 var(--text-lg)/2rem var(--font);background:repeating-linear-gradient(transparent 0 calc(2rem - 1px),color-mix(in srgb,var(--ink-subtle) 12%,transparent) calc(2rem - 1px) 2rem);scroll-padding:.25rem}
  textarea::placeholder{color:var(--ink-subtle);font-style:italic}
  .leaf-foot{margin-top:auto;padding-top:var(--space-4)}
  .entry-body{white-space:pre-wrap;overflow-wrap:anywhere;font:400 var(--text-xl)/1.6 var(--font);letter-spacing:var(--ls-prose);text-wrap:pretty;margin:var(--space-5) 0 var(--space-6)}
  .index{margin-top:var(--space-3);max-height:48dvh;overflow:auto;overscroll-behavior:contain;padding-right:.4rem}.index article{padding:var(--space-4) 0}.index article+article{border-top:1px solid var(--rule)}
  .index-entry{padding:0;background:none;color:var(--ink);border:0;text-align:left;font:inherit;transition:color var(--dur-micro) var(--ease-soft)}
  .index-entry{width:100%;display:grid;gap:var(--space-1)}.index-entry span{font:400 var(--text-md)/var(--lh-ui) var(--font);white-space:pre-wrap;overflow-wrap:anywhere}
  .visit-site{min-height:36px}.push{margin-left:auto}.forget{margin-top:var(--space-2)}
  .turns{display:flex;align-items:center;gap:var(--space-1);margin-left:calc((var(--icon) - var(--control)) / 2)}
  .note{margin-top:var(--space-3);font-size:var(--ui-xs)}
  .index-entry:is(:hover,:focus-visible){color:var(--accent)}
  @media(hover:hover) and (prefers-reduced-motion:no-preference){
    .page-marker .marker-face,.leaf button:not(.paper-control){transition:translate var(--dur-micro) var(--ease-soft)}
    .page-marker:hover .marker-face,.leaf button:not(.paper-control):enabled:hover{translate:0 -1px}
  }
  @media(prefers-reduced-motion:no-preference){
    .page-marker:active .marker-face,.leaf button:not(.paper-control):enabled:active{translate:0 1px}
  }
  .leaf h2:focus-visible{outline:0;text-decoration:underline;text-decoration-color:var(--line-strong);text-decoration-thickness:1px;text-underline-offset:.12em}
  textarea:focus-visible{outline:0;box-shadow:inset 2px 0 var(--line-strong);padding-left:.65rem}
  @media(prefers-reduced-motion:no-preference){dialog[open]{animation:unfold .22s var(--ease-out)}@keyframes unfold{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}}
  .page-copy{transform-origin:left center}
  @media(prefers-reduced-motion:no-preference){
    dialog[open].closing,dialog.closing::backdrop{animation:journal-close 150ms ease-in both}
    @keyframes journal-close{to{opacity:0}}
  }
  /* Phones: a notice or the song takes its own line above the write action, so neither is cut short */
  @media(max-width:600px){.bottom .lead:has(.status:not(:empty),:global(.now-playing)){flex-basis:100%;max-width:none}}
  @media(max-width:600px){
    .bottom{flex-wrap:wrap}
    dialog{max-height:92dvh}.folio{display:flex;flex-direction:column;min-height:0}.cover{min-height:5rem;background-position:center 55%}
    .imprint,.reading .imprint{padding:.65rem 1.3rem}.imprint strong{font-size:var(--display-3)}
    .browsing .cover{height:5.75rem;flex:none}
    .browsing .leaf{flex:1}
    .reading .cover{flex-direction:row-reverse;justify-content:space-between;align-items:center}
    .plate{margin:.2rem 1rem;width:5.75rem}.plate :is(img,svg){max-height:4.65rem}.plate svg{width:min(100%,4.65rem)}
    .leaf{padding:var(--space-3) var(--sheet-inset) var(--space-5)}.leaf-head{margin-bottom:var(--space-4)}.leaf-foot{gap:var(--space-1)}
    .entry-body{margin:var(--space-4) 0 var(--space-5)}
  }
  dialog:modal,dialog::backdrop{overscroll-behavior:contain}
  dialog::backdrop{overflow:hidden}
</style>
