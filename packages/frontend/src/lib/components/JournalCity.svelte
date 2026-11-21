<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import ValleyLoading from './ValleyLoading.svelte';
  import { api, type EntryData } from '$lib/api.js';
  import { sessionVersion } from '$lib/session-version.js';
  import { prependEntry } from '$lib/stores/entries.svelte.js';
  import { resetJournalData } from '$lib/stores/session.svelte.js';
  import { forgetAddress, type ForgottenAddress } from '../../../../shared/city-address.js';
  import { hashPage } from '$lib/town/city-growth.js';
  import { paintedCoast, type Site } from '$lib/town/painted-coast.js';
  import type { createHarbor } from '$lib/town/harbor.js';

  import type { PageMarker } from '$lib/town/city-page-markers.js';

  const buildings:Record<Site['kind'],string>={
    houses:'Riverside houses',steps:'The steps',terraces:'The terraces',crescent:'The crescent',
    apartments:'The apartments',market:'The market',warehouse:'The warehouse',crane:'The dock crane',
    pines:'The pine grove',glasshouse:'The glasshouse',station:'The station',civic:'The town hall',
    belfry:'The belfry',towers:'The towers',arches:'The arches',wharf:'The wharf',beacon:'The beacon'
  };
  let {guest=false,afterglow=false,onExit,cityAudio,busy=$bindable(false)}:{guest?:boolean;afterglow?:boolean;onExit?:()=>void;cityAudio?:Snippet;busy?:boolean}=$props();
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
  let entries=$state.raw<EntryData[]>([]),scene=$state.raw<Awaited<ReturnType<typeof createHarbor>>|null>(null);
  let forgotten=$state.raw<ForgottenAddress[]>([]);
  let ready=$state(false),paused=$state(false),graphicsError=$state(false),error=$state(''),notice=$state('');
  let painted=$state(true),readId=$state('');
  let markers=$state.raw<PageMarker[]>([]),writingDate=$state(new Date());
  const valleyViews=['City','Overlook'] as const;
  let panel=$state<'write'|'pages'|'read'|'forget'>('write'),draft=$state(''),draftId='',alive=false,reveal=false;
  const ordered=$derived([...entries].sort((a,b)=>b.created_at-a.created_at||b.id.localeCompare(a.id)));
  const latest=$derived(ordered[0]);
  const plan=$derived(paintedCoast(entries,forgotten));
  const openedPage=$derived(entries.find(entry=>entry.id===readId));
  const site=$derived(plan.addresses.get(readId));
  const neighbors=$derived(site?ordered.filter(page=>plan.addresses.get(page.id)===site):[]);
  const room=$derived(neighbors.findIndex(page=>page.id===readId));
  const folios=$derived(new Map([...entries,...forgotten].sort((a,b)=>a.created_at-b.created_at||a.id.localeCompare(b.id)).map((page,i)=>[page.id,i+1])));
  const fullDate=new Intl.DateTimeFormat(undefined,{month:'long',day:'numeric',year:'numeric'});
  const weekday=new Intl.DateTimeFormat(undefined,{weekday:'long'});
  const opening=$derived((!ready||!scene)&&!error&&!graphicsError);
  const date=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'});
  async function read(){
    try{
      const journal=guest?{entries:examples(),forgotten:[]}:await api.city.get();
      if(alive){entries=journal.entries;forgotten=journal.forgotten;ready=true;error='';}
    }
    catch{if(alive)error='Your journal could not be opened.';}
  }
  async function graphics(){
    graphicsError=false;
    try{
      const {createHarbor}=await import('$lib/town/harbor.js');
      if(!alive)return;
      const city=await createHarbor(canvas,readPage,afterglow,next=>{if(alive)markers=next;});
      if(alive)scene=city;else city.destroy();
    }catch{if(alive)graphicsError=true;}
  }
  onMount(()=>{
    alive=true;const preference=matchMedia('(prefers-reduced-motion: reduce)');
    const sync=()=>{paused=preference.matches;};sync();preference.addEventListener('change',sync);
    void read();void graphics();
    return ()=>{alive=false;preference.removeEventListener('change',sync);scene?.destroy();};
  });
  $effect(()=>{scene?.pause(paused);});
  $effect(()=>{scene?.setPainted(painted);});
  $effect(()=>{const current=scene;if(current){current.update(plan,reveal);reveal=false;}});
  async function open(which:typeof panel){
    if(busy)return;
    panel=which;error='';if(which==='write')writingDate=new Date();
    await tick();if(!alive)return;
    if(!dialog.open)dialog.showModal();
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

<main class="coast" aria-label="Journal city">
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
  {#if opening}<ValleyLoading label={ready?'Opening the valley…':'Opening your journal…'} onExit={guest?onExit:undefined}/>{/if}
  <div class="upper" inert={opening}>
    <div class="city-label"><div class="scope">{guest?'Example city':'Your city'}</div>
      {#if cityAudio}<div class="city-audio">{@render cityAudio()}</div>{/if}
    </div>
    <div class="tools">
      {#if guest}<button onclick={onExit}>Leave visit</button>{/if}
      <button onclick={()=>open('pages')} disabled={!ready}>Pages</button>
      {#if scene?.hasPaint}<button class="finish" aria-pressed={painted} onclick={()=>painted=!painted}>Gouache</button>{/if}
      <button class="motion" aria-label={paused?'Resume ambient motion':'Pause ambient motion'} onclick={()=>paused=!paused}>{paused?'▷':'Ⅱ'}</button>
    </div>
  </div>
  <div class="bottom" inert={opening}>
    <div>
      <p class="status" role="status">{error||(!ready?'Opening your journal…':graphicsError?'City view unavailable. Your journal is open.':!scene?'Opening the valley…':notice)}</p>
      {#if scene}
        <nav class="viewpoints" aria-label="Valley viewpoints">
          {#each valleyViews as view}<button onclick={()=>scene?.visit(view)}>{view}</button>{/each}
        </nav>
      {/if}
      <h1>{plan.sites.length?'The valley city':'An unwritten valley'}</h1>
      {#if latest}<p class="detail">{entries.length} {entries.length===1?'page':'pages'} <span>·</span> Last written {date.format(latest.created_at*1000)}</p>
      {:else if ready}<p class="detail">{forgotten.length?'No pages left to read.':'Your first page begins the city.'}</p>{/if}
    </div>
    <div class="actions">
      {#if graphicsError}<button onclick={graphics}>Retry city</button>{/if}
      {#if !ready&&error}<button onclick={read}>Retry journal</button>{/if}
      <button class="write" disabled={!ready||busy} onclick={()=>open('write')}>{draft?'Return to draft':'Write a page'} <span aria-hidden="true">↗</span></button>
    </div>
  </div>
  <dialog bind:this={dialog} aria-labelledby="journal-heading" oncancel={e=>{if(busy)e.preventDefault();}}
    onclose={()=>{if(document.activeElement===document.body)canvas.focus({preventScroll:true});}}>
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
          <button class="close" aria-label="Close" disabled={busy} onclick={()=>dialog.close()}>×</button>
        </header>
        {#if panel==='write'}
          <h2 id="journal-heading" tabindex="-1">A new page</h2>
          <time datetime={writingDate.toISOString()}>{weekday.format(writingDate)}, {fullDate.format(writingDate)}</time>
          <form onsubmit={event=>{event.preventDefault();void save();}}>
            <label class="sr-only" for="entry">Your journal entry</label>
            <textarea id="entry" rows="5" maxlength="500" required placeholder="What would you like to remember?" bind:value={draft}
              oninput={()=>draftId=''} onkeydown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.isComposing){e.preventDefault();void save();}}}></textarea>
            <div class="leaf-foot"><span class="count" aria-label={draft.length+' of 500 characters'}>{draft.length} / 500</span>
              <button disabled={busy||!ready||!draft.trim()} class="ink">{busy?'Saving…':'Save page'}</button></div>
          </form>
        {:else if panel==='forget' && openedPage}
          <h2 id="journal-heading">Forget this page?</h2>
          <p>The words will be permanently removed from this journal. {neighbors.length>1?'The other pages at this address will stay.':'The building will stay, and its lights will go out.'}</p>
          {#if !guest}<p class="note">Readings and memoir passages that drew on this page will disappear.</p>{/if}
          <div class="leaf-foot">
            <button class="text-action" data-keep-page disabled={busy} onclick={()=>open('read')}>Keep this page</button>
            <button class="ink" disabled={busy} onclick={forgetPage}>{busy?'Forgetting…':'Forget page'}</button>
          </div>
        {:else if panel==='read' && openedPage}
          <h2 id="journal-heading" tabindex="-1">{weekday.format(openedPage.created_at*1000)}</h2>
          <time datetime={new Date(openedPage.created_at*1000).toISOString()}>{fullDate.format(openedPage.created_at*1000)}</time>
          <p class="entry-body">{openedPage.body}</p>
          <div class="leaf-foot">
            {#if neighbors.length>1}
              <nav class="turns" aria-label="Pages at this building">
                <button aria-label="Previous page at this building" disabled={room<=0} onclick={()=>readPage(neighbors[room-1]!.id)}>‹</button>
                <span>{room+1} of {neighbors.length} here</span>
                <button aria-label="Next page at this building" disabled={room>=neighbors.length-1} onclick={()=>readPage(neighbors[room+1]!.id)}>›</button>
              </nav>
            {/if}
            <button class="text-action" onclick={()=>open('pages')}>All pages</button>
          </div>
          <button class="text-action" onclick={()=>open('forget')}>Forget this page</button>
        {:else}
          <h2 id="journal-heading" tabindex="-1">Your pages</h2>
          <div class="index">
            {#each ordered as page (page.id)}
              <article>
                <button class="index-entry" onclick={()=>readPage(page.id)}>
                  <time datetime={new Date(page.created_at*1000).toISOString()}>{date.format(page.created_at*1000)}</time>
                  <span>{page.body}</span>
                </button>
                {#if scene && plan.addresses.has(page.id)}<button class="visit-site" onclick={()=>{dialog.close();scene?.visit('Page',page.id);}}>Visit in city ↗</button>{/if}
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
  .coast{position:relative;height:100%;min-height:0;overflow:hidden;color:#fff4e8;background:linear-gradient(#8c8395,#3d5466)}
  canvas{content-visibility:auto;contain-intrinsic-size:auto 700px;width:100%;height:100%;display:block;touch-action:none;cursor:grab}canvas:active{cursor:grabbing}
  .upper,.bottom{position:absolute;inset-inline:0;display:flex;align-items:center;justify-content:space-between;padding-inline:var(--gutter);pointer-events:none;gap:1rem}
  .upper{top:clamp(.75rem,2.5vh,1.8rem)}.tools,.actions{display:flex;gap:.45rem;align-items:center}
  button{min-height:44px;cursor:pointer;font:500 .92rem/1.2 var(--font-ui)}
  .upper button,.bottom button{pointer-events:auto;border-radius:3px;border:1px solid #ede4e179;background:#242833d9;color:#fff6e9;padding:.65rem 1rem}
  .scope{font:500 .82rem var(--font-ui);letter-spacing:.05em;background:#282937bf;padding:.42rem .7rem;border-left:2px solid #ebc097}
  .city-label{display:flex;align-items:center;gap:.4rem}
  .city-audio{display:flex;pointer-events:auto;border-radius:50%;background:#242833d9}
  .tools .finish[aria-pressed=true]{color:#243733;background:#e5d9bf;border-color:#e5d9bf}
  @media(max-width:520px){.upper{align-items:flex-start;flex-wrap:wrap}.tools{flex-wrap:wrap;justify-content:flex-end}}
  .tools .motion{width:44px;padding:0}.bottom{bottom:0;padding-block:3.6rem clamp(1.4rem,4vh,3rem);background:linear-gradient(transparent,#13232fee);align-items:flex-end}
  h1,h2{font:400 clamp(2.25rem,4vw,4.3rem)/1 var(--font-reading);margin:0;letter-spacing:-.055em}
  .status,.detail{margin:.55rem 0 0;color:#f2e5d7;font:.94rem/1.4 var(--font-ui)}.status{margin:0 0 .4rem}.status:empty{display:none}.detail span{margin:0 .35rem}
  .actions .write,.ink{background:#f5eadb;color:#202b36;border:1px solid #f5eadb;padding:.8rem 1.15rem}.write span{margin-left:1rem}
  .viewpoints{display:flex;align-items:center;gap:.15rem;width:fit-content;margin-bottom:.65rem;pointer-events:auto}
  .bottom .viewpoints button{border:0;border-bottom:1px solid #f4e5cf80;border-radius:0;background:#172d30c4;font-size:.78rem;padding:.48rem .76rem;min-height:44px}
  .bottom .viewpoints button:hover,.bottom .viewpoints button:focus-visible{background:#354e50}
  .page-marker{position:absolute;transform:translate(-50%,-100%);height:49px;min-width:44px;padding:0 3px 13px;display:grid;place-items:center;background:transparent;border:0;color:#fff8df}
  .page-marker::after{content:'';position:absolute;bottom:0;height:13px;width:1px;background:#fff5cf;box-shadow:0 1px 2px #203a32}
  .marker-face{display:flex;align-items:center;gap:6px;border:1px solid #e9d69c;border-radius:20px;background:#1d3834f2;box-shadow:0 2px 7px #10272680;padding:7px}
  .marker-label{display:none;font:600 .75rem var(--font-ui);white-space:nowrap}
  .featured .marker-face,.page-marker:is(:hover,:focus-visible) .marker-face{padding-inline:10px;background:#f3e4b9;color:#25382d}
  .featured .marker-label,.page-marker:is(:hover,:focus-visible) .marker-label{display:block}
  dialog{position:fixed;inset:0;margin:auto;width:min(48rem,calc(100% - 2rem));max-height:88dvh;color:#233b36;background:#f8f5e9;border:0;padding:0;border-radius:3px;overflow:auto;overscroll-behavior:contain;box-shadow:0 20px 85px #0a1c21a6,2px 3px 0 #d1c8ad}
  dialog::backdrop{background:#132d3280}
  .folio{display:grid;grid-template-columns:minmax(10rem,.52fr) minmax(0,1fr);min-height:24rem}
  .cover{display:flex;flex-direction:column;justify-content:flex-end;position:relative;isolation:isolate;background:#24473e url('/city/valley-print.webp') 56% center/cover;color:#fff6d9}
  .cover::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(0deg,#17392ff5,transparent 66%);box-shadow:inset -6px 0 10px -7px #112d24}
  .imprint{padding:1.65rem 1.4rem;display:grid;gap:2px}
  .imprint span,.leaf-head,.count,.turns span,.note,time{font:.8rem/1.45 var(--font-ui)}
  .imprint strong{font:400 clamp(1.7rem,3.5vw,2.7rem)/1.03 var(--font-reading);letter-spacing:-.035em}
  .reading .cover{background:#c6cfba;color:#25413b;justify-content:center}
  .reading .cover::after{background:none}
  .plate{margin:.8rem .5rem 0}.plate img{display:block;width:100%;max-height:15rem;object-fit:contain;filter:drop-shadow(0 5px 3px #46533822)}
  .reading .imprint{padding:1rem 1.35rem 1.5rem}
  .leaf{min-width:0;display:flex;flex-direction:column;padding:1.2rem clamp(1.35rem,3.5vw,2.6rem) 1.35rem;background:linear-gradient(90deg,#b9b39c33,transparent 15px)}
  .leaf-head,.leaf-foot{display:flex;justify-content:space-between;align-items:center;gap:1rem}
  .leaf-head{border-bottom:1px solid #b7c1b0;color:#50665c;margin-bottom:1.4rem}
  .close,.turns button{width:44px;height:44px;border:0;background:none;color:#29463c;font-size:1.5rem}.close{margin-right:-.7rem}
  .leaf h2{font:400 clamp(2.1rem,4vw,3.15rem)/1.07 var(--font-reading);letter-spacing:-.05em;margin-bottom:.42rem}
  .leaf time,.count,.note{color:#54655a}.sr-only{position:absolute;width:1px;height:1px;padding:0;clip-path:inset(50%);overflow:hidden;white-space:nowrap}
  form{display:flex;flex-direction:column;gap:1rem;flex:1;margin-top:1.25rem}
  textarea{width:100%;min-height:7.5rem;resize:vertical;border:0;border-radius:0;padding:0 .2rem;color:#203c34;caret-color:#416a52;font:1.26rem/2rem var(--font-reading);background:repeating-linear-gradient(transparent 0 calc(2rem - 1px),#768b772e calc(2rem - 1px) 2rem);scroll-padding:.25rem}
  textarea::placeholder{color:#66776a;font-style:italic}
  .leaf-foot{margin-top:auto;border-top:1px solid #b7c1b0;padding-top:.7rem}
  .ink{background:#23483b;color:#fff8e6;border:0;border-radius:3px;padding:.72rem 1.4rem}
  .ink:enabled:hover{background:#32634f}.ink:disabled{background:#d7dacc;color:#536253}
  button:disabled{cursor:default}
  .entry-body{white-space:pre-wrap;overflow-wrap:anywhere;font:1.4rem/1.65 var(--font-reading);margin:1.4rem 0 2.2rem}
  .index{margin-top:.8rem;max-height:48dvh;overflow:auto;overscroll-behavior:contain;padding-right:.4rem}.index article{border-bottom:1px solid #bcc6b6;padding:.65rem 0}
  .index-entry,.text-action,.visit-site{background:none;color:#294d3d;border:0;text-align:left}
  .index-entry{width:100%;display:grid;gap:.35rem}.index-entry span{font:1.16rem/1.45 var(--font-reading);white-space:pre-wrap;overflow-wrap:anywhere}
  .visit-site,.text-action{text-decoration:underline;text-underline-offset:.22em;font-size:.82rem}.text-action{margin-left:auto}
  .turns{display:flex;align-items:center;gap:.2rem}.turns button:disabled{opacity:.3}
  .note{margin:.7rem 0 0;font-size:.74rem}
  :is(button,textarea):focus-visible{outline:2px solid #7e5725;outline-offset:2px}
  .page-marker:focus-visible .marker-face{outline:2px solid #fff7db;outline-offset:2px}
  .leaf :is(.index-entry,.text-action,.visit-site,.turns button,.close):enabled:is(:hover,:focus-visible){background:#e4e9da}
  @media(hover:hover) and (prefers-reduced-motion:no-preference){
    .page-marker .marker-face,.leaf button{transition:translate .15s ease-out}
    .page-marker:hover .marker-face,.leaf button:enabled:hover{translate:0 -1px}
  }
  @media(prefers-reduced-motion:no-preference){
    .page-marker:active .marker-face,.leaf button:enabled:active{translate:0 1px}
  }
  .leaf h2:focus-visible{outline:0;text-decoration:underline;text-decoration-color:#909f87;text-decoration-thickness:1px;text-underline-offset:.12em}
  textarea:focus-visible{outline:0;box-shadow:inset 2px 0 #8f9d77;padding-left:.65rem}
  @media(prefers-reduced-motion:no-preference){dialog[open]{animation:unfold .22s ease-out}@keyframes unfold{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}}
  @media(max-width:600px){
    .bottom{flex-wrap:wrap}.upper{gap:.4rem}.upper button{padding:.5rem .65rem}.scope{font-size:.73rem}.tools{gap:.2rem}.detail{font-size:.81rem}
    dialog{max-height:92dvh}.folio{display:flex;flex-direction:column;min-height:0}.cover{min-height:5rem;background-position:center 55%}
    .imprint,.reading .imprint{padding:.65rem 1.3rem}.imprint strong{font-size:1.7rem}
    .reading .cover{flex-direction:row-reverse;justify-content:space-between;align-items:center}
    .plate{margin:.2rem 1rem;width:5.75rem}.plate img{max-height:4.65rem}
    .leaf{padding:.3rem 1.3rem 1.1rem}.leaf-head{margin-bottom:.9rem}.leaf-foot{gap:.15rem}
    .entry-body{margin:1.1rem 0 1.45rem}
  }
</style>
