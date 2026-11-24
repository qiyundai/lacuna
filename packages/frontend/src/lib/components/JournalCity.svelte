<script lang="ts">
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
  import { forgetAddress, type ForgottenAddress } from '../../../../shared/city-address.js';
  import { hashPage } from '$lib/town/city-growth.js';
  import { paintedCoast, type Site } from '$lib/town/painted-coast.js';
  import { journalDetails } from '$lib/town/journal-details.js';
  import type { SceneCues } from '$lib/town/journal-scenes.js';
  import type { createHarbor } from '$lib/town/harbor.js';

  import type { PageMarker } from '$lib/town/city-page-markers.js';

  const buildings:Record<Site['kind'],string>={
    houses:'Riverside houses',steps:'The steps',terraces:'The terraces',crescent:'The crescent',
    apartments:'The apartments',market:'The market',warehouse:'The warehouse',crane:'The dock crane',
    pines:'The pine grove',glasshouse:'The glasshouse',station:'The station',civic:'The town hall',
    belfry:'The belfry',towers:'The towers',arches:'The arches',wharf:'The wharf',beacon:'The beacon'
  };
  let {guest=false,afterglow=false,fixedHour,onExit,navigation,draft=$bindable(''),draftId=$bindable(''),busy=$bindable(false)}:{guest?:boolean;afterglow?:boolean;fixedHour?:number;onExit?:()=>void;navigation?:Snippet;draft?:string;draftId?:string;busy?:boolean}=$props();
  const notes = [
    'The light was still on across the street.', 'Made tea before the alarm.', 'The morning train was nearly empty.',
    'I borrowed a blue bowl and forgot to give it back.', 'We walked home slowly.', 'There was a postcard in the mail.',
    'The rain let up at lunch.', 'I can hear the ferry from here.', 'Washed the window over the sink.',
    'Bought peaches even though we had enough.', 'The library stayed open late.', 'I kept the ticket.',
    'A long conversation on the stairs.', 'Someone planted thyme by the gate.', 'We took the last bus.',
    'The book fell open to the same page.', 'I went down to the water before work.', 'Dinner on the landing.',
    'I woke up early and stayed there listening.', 'The sky was the color of a plum.', 'We made too much rice.',
    'The old radio still works.', 'My shoes dried in the sun.', 'I mailed the letter on the way home.',
    'The kettle was already on.', 'I heard a song I used to know.', 'We watched the weather change.',
    'Another chair by the window.', 'I finally fixed that loose hinge.', 'A gull slept on the roof.',
    'The bread was warm all the way home.', 'Walked the long way for once.'
  ];
  function examples():EntryData[] {
    return notes.map((body,i)=>({id:hashPage('lacuna-coast-'+i).toString(16).padStart(32,'0'),riverEdition:3 as const,user_id:'guest',body,
      created_at:1609459200+i*49171,solidified_at:1609459200+i*49171,kept_at:null}));
  }
  let canvas:HTMLCanvasElement,dialog:HTMLDialogElement;
  let pageOpen=$state(false);
  function syncSound(){
    scene?.setSound(valleyAudioContext(),valleyPlayback.ambience&&!valleyPlayback.muted,pageOpen);
  }
  let entries=$state.raw<EntryData[]>([]),scene=$state.raw<Awaited<ReturnType<typeof createHarbor>>|null>(null);
  let forgotten=$state.raw<ForgottenAddress[]>([]);
  let ready=$state(false),paused=$state(false),graphicsError=$state(false),error=$state(''),notice=$state('');
  let readId=$state('');
  let markers=$state.raw<PageMarker[]>([]),writingDate=$state(new Date());
  const valleyViews=['City','Overlook'] as const;
  let panel=$state<'write'|'pages'|'read'|'forget'>('write'),alive=false,reveal=false;
  const ordered=$derived([...entries].sort((a,b)=>b.created_at-a.created_at||b.id.localeCompare(a.id)));
  const seen = new WeakMap<EntryData, SceneCues>();
  const plan=$derived.by(()=>{
    const coast = paintedCoast(entries,forgotten);
    return {...coast, details: journalDetails(coast,entries,seen)};
  });
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
      const journal=guest?{entries:examples(),forgotten:[]}:await api.city.get();
      if(!alive || request!==readRequest || version!==sessionVersion.value)return;
      entries=journal.entries;forgotten=journal.forgotten;
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
      const city=await createHarbor(canvas,readPage,afterglow,next=>{if(alive)markers=next;},fixedHour);
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
  $effect(()=>{const current=scene;if(current){current.update(plan,reveal);reveal=false;}});
  async function open(which:typeof panel){
    if(busy)return;
    panel=which;error='';if(which==='write')writingDate=new Date();
    await tick();if(!alive)return;
    if(!dialog.open)dialog.showModal();
    pageOpen=true;
    dialog.scrollTop=0;
    dialog.querySelector<HTMLElement>(which==='write'?'textarea':which==='forget'?'[data-keep-page]':'#journal-heading')?.focus({preventScroll:true});
  }
  function readPage(id:string){
    readId=id;scene?.visit('Page',id);void open('read');
  }
  async function forgetPage(){
    if(busy || panel!=='forget' || !openedPage)return;
    const id=openedPage.id,version=sessionVersion.value;
    busy=true;error='';
    try{
      const address=guest?forgetAddress(entries,forgotten,entries.findIndex(e=>e.id===id)):(await api.entries.forget(id)).address;
      if(!alive||version!==sessionVersion.value)return;
      if(!guest)resetJournalData();
      forgotten=[...forgotten.filter(a=>a.id!==id),address].sort((a,b)=>a.position-b.position);
      entries=entries.filter(e=>e.id!==id);
      readId='';dialog.close();notice='Page forgotten. Its address remains.';
    }catch{error='Could not forget this page. Try again.';}
    finally{if(alive)busy=false;}
  }
  async function save(){
    const body=draft.trim();if(!body||busy||!ready)return;
    draftId ||= crypto.randomUUID().replaceAll('-','');
    const version=sessionVersion.value;busy=true;error='';
    try{
      const now=Math.floor(Date.now()/1000);
      const entry=guest?{id:draftId,riverEdition:3 as const,body,user_id:'guest',created_at:now,solidified_at:now,kept_at:null}:(await api.city.write(body,now,draftId)).entry;
      if(!alive||version!==sessionVersion.value)return;
      if(!guest)prependEntry(entry);
      reveal=true;entries=[...entries.filter(e=>e.id!==entry.id),entry];draft='';draftId='';dialog.close();
      await tick();
      const home=plan.addresses.get(entry.id);
      notice=home?'Page saved at '+buildings[home.kind].replace(/^The /,'the ')+'.':'Page saved.';
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
  <canvas bind:this={canvas} inert={opening} tabindex="0" aria-label="A city growing along the valley river. Drag or use arrow keys to orbit, right-drag to pan, and scroll or pinch to zoom. Home returns to the city. Select a building to read its page."></canvas>
  {#if ready && scene}
    {#each markers as marker,i (marker.id)}
      {@const marked=plan.addresses.get(marker.id)}
      {#if marked}
        <button class="page-marker" class:featured={i===0} style:left={marker.x+'px'} style:top={marker.y+'px'}
          data-page-marker aria-label={'Read page '+folios.get(marker.id)+' at '+buildings[marked.kind]} onclick={()=>readPage(marker.id)}>
          <span class="marker-face"><svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M10 6Q7 3 2 4v11q5-1 8 2 3-3 8-2V4q-5-1-8 2Zm0 0v11"/></svg><span class="marker-label">Read page</span></span>
        </button>
      {/if}
    {/each}
  {/if}
  {#if opening}<ValleyLoading audio label={ready?'Opening the valley…':'Opening your journal…'} onExit={guest?onExit:undefined}/>{/if}
  <h1 class="visually-hidden" tabindex="-1">{guest?'Example city':'Your city'}</h1>
  {#if !opening}
    <Masthead floating audio sound={soundToggles} disabled={busy} world={guest?'Example city':'The valley city'} pageCount={entries.length}>
      <IconAction icon="pages" label="Pages" onclick={()=>open('pages')} disabled={!ready}/>
      {#if scene}
        {#each valleyViews as view}
          <IconAction icon={view==='City'?'city':'overlook'} label={view==='City'?'City view':view} onclick={()=>scene?.visit(view)}/>
        {/each}
        <IconAction icon={paused?'play':'pause'} label={paused?'Resume ambient motion':'Pause ambient motion'} onclick={()=>paused=!paused}/>
      {/if}
      {@render navigation?.()}
      {#if guest}
        <IconAction icon="privacy" label="Privacy" href="/privacy"/>
        <IconAction icon="leave" label="Leave visit" onclick={onExit}/>
      {/if}
    </Masthead>
    <div class="bottom">
      <!-- Bottom-left: a notice when there is one, otherwise the song that is playing -->
      <div class="lead"><p class="status" role="status">{statusLine}</p>{#if !statusLine}<NowPlaying/>{/if}</div>
      <div class="actions">
        {#if graphicsError}<IconAction icon="retry" label="Retry city" onclick={graphics}/>{/if}
        {#if !ready&&error}<IconAction icon="retry" label="Retry journal" onclick={read}/>{/if}
        <IconAction tone="raised" icon="write" label={draft?'Return to draft':'Write a page'} disabled={!ready||busy} onclick={()=>open('write')}/>
      </div>
    </div>
  {/if}
  <dialog bind:this={dialog} aria-labelledby="journal-heading" oncancel={e=>{if(busy)e.preventDefault();}}
    onclose={()=>{pageOpen=dialog.open;if(document.activeElement===document.body)canvas.focus({preventScroll:true});}}>
    <div class="folio" class:reading={panel==='read'||panel==='forget'}>
      <aside class="cover" aria-label={site && (panel==='read'||panel==='forget')?'Page location':'Journal cover'}>
        {#if (panel==='read'||panel==='forget') && site}
          <div class="plate"><img src={'/city/paint/'+site.kind+'.webp'} alt=""/></div>
          <div class="imprint"><span>{site.bank===0?'West bank':'East bank'}</span><strong>{buildings[site.kind]}</strong></div>
        {:else}
          <div class="imprint"><span>{guest?'Example journal':'City journal'}</span><strong>Lacuna</strong></div>
        {/if}
      </aside>
      <div class="leaf">
        <header class="leaf-head">
          <span>{panel==='write'?'Page '+(folios.size+1):panel==='pages'?'Journal index':'Page '+(folios.get(readId)??'')}</span>
          <div class="leaf-tools">
            <SoundToggle surface="paper"/>
            <button class="paper-control" aria-label="Close" disabled={busy} onclick={()=>dialog.close()}><Icon name="close"/></button>
          </div>
        </header>
        {#if panel==='write'}
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
          <h2 id="journal-heading" tabindex="-1">{weekday.format(openedPage.created_at*1000)}</h2>
          <time datetime={new Date(openedPage.created_at*1000).toISOString()}>{fullDate.format(openedPage.created_at*1000)}</time>
          <p class="entry-body">{openedPage.body}</p>
          <div class="leaf-foot">
            {#if neighbors.length>1}
              <nav class="turns" aria-label="Pages at this building">
                <button class="paper-control" aria-label="Previous page at this building" disabled={room<=0} onclick={()=>readPage(neighbors[room-1]!.id)}><Icon name="chevron-left"/></button>
                <span>{room+1} of {neighbors.length} here</span>
                <button class="paper-control" aria-label="Next page at this building" disabled={room>=neighbors.length-1} onclick={()=>readPage(neighbors[room+1]!.id)}><Icon name="chevron-right"/></button>
              </nav>
            {/if}
            <button class="atlas-link push" onclick={()=>open('pages')}>All pages</button>
          </div>
          <button class="atlas-link subtle forget" onclick={()=>open('forget')}>Forget this page</button>
        {:else}
          <h2 id="journal-heading" tabindex="-1">Your pages</h2>
          <div class="index">
            {#each ordered as page (page.id)}
              <article>
                <button class="index-entry" onclick={()=>readPage(page.id)}>
                  <time datetime={new Date(page.created_at*1000).toISOString()}>{date.format(page.created_at*1000)}</time>
                  <span>{page.body}</span>
                </button>
                {#if scene && plan.addresses.has(page.id)}<button class="atlas-link subtle visit-site" onclick={()=>{dialog.close();scene?.visit('Page',page.id);}}>Visit in city ↗</button>{/if}
              </article>
            {:else}<p>Your saved pages will appear here.</p>{/each}
          </div>
        {/if}
        {#if guest}<p class="note">{panel==='read'?'Example journal. ':''}Changes last for this visit.</p>{/if}
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
  dialog::backdrop{background:var(--scene-backdrop)}
  .folio{display:grid;grid-template-columns:minmax(10rem,.52fr) minmax(0,1fr);min-height:26rem}
  .cover{display:flex;flex-direction:column;justify-content:flex-end;position:relative;isolation:isolate;background:var(--scene-shade) url('/city/valley-print.webp') 56% center/cover;color:var(--scene-ink)}
  .cover::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(0deg,color-mix(in srgb,var(--scene-shade) 96%,transparent),transparent 66%);box-shadow:inset -6px 0 10px -7px var(--scene-shade)}
  .imprint{padding:1.65rem 1.4rem;display:grid;gap:2px}
  .imprint span,.leaf-head,.count,.turns span,.note,time{font:var(--ui-sm)/1.45 var(--font)}
  .imprint strong{font:400 var(--display-2)/var(--lh-display) var(--font);letter-spacing:var(--ls-display)}
  .reading .cover{background:var(--line);color:var(--ink);justify-content:center}
  .reading .cover::after{background:none}
  .plate{margin:.8rem .5rem 0}.plate img{display:block;width:100%;max-height:15rem;object-fit:contain;filter:drop-shadow(0 5px 3px color-mix(in srgb,var(--ink) 13%,transparent))}
  .reading .imprint{padding:1rem 1.35rem 1.5rem}
  .leaf{min-width:0;display:flex;flex-direction:column;padding:var(--space-5) var(--sheet-inset) var(--space-6);background:linear-gradient(90deg,color-mix(in srgb,var(--line) 45%,transparent),transparent 15px)}
  .leaf-head,.leaf-foot{display:flex;justify-content:space-between;align-items:center;gap:var(--space-4)}
  .leaf-head{color:var(--ink-muted);margin-bottom:var(--space-5)}
  /* Pull the tools out by half the hit-area padding so the × lines up with the text edge */
  .leaf-tools{display:flex;margin-right:calc((var(--icon) - var(--control)) / 2)}
  .leaf h2{font:400 var(--display-2)/var(--lh-display) var(--font);letter-spacing:var(--ls-display);margin-bottom:var(--space-2)}
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
  /* Phones: a notice or the song takes its own line above the write action, so neither is cut short */
  @media(max-width:600px){.bottom .lead:has(.status:not(:empty),:global(.now-playing)){flex-basis:100%;max-width:none}}
  @media(max-width:600px){
    .bottom{flex-wrap:wrap}
    dialog{max-height:92dvh}.folio{display:flex;flex-direction:column;min-height:0}.cover{min-height:5rem;background-position:center 55%}
    .imprint,.reading .imprint{padding:.65rem 1.3rem}.imprint strong{font-size:var(--display-3)}
    .reading .cover{flex-direction:row-reverse;justify-content:space-between;align-items:center}
    .plate{margin:.2rem 1rem;width:5.75rem}.plate img{max-height:4.65rem}
    .leaf{padding:var(--space-3) var(--sheet-inset) var(--space-5)}.leaf-head{margin-bottom:var(--space-4)}.leaf-foot{gap:var(--space-1)}
    .entry-body{margin:var(--space-4) 0 var(--space-5)}
  }
</style>
