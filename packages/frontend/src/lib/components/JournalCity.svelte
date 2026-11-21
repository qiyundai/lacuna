<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ValleyLoading from './ValleyLoading.svelte';
  import { api, type EntryData } from '$lib/api.js';
  import { sessionVersion } from '$lib/session-version.js';
  import { prependEntry } from '$lib/stores/entries.svelte.js';
  import { hashPage } from '$lib/town/city-growth.js';
  import { paintedCoast } from '$lib/town/painted-coast.js';
  import type { createHarbor } from '$lib/town/harbor.js';

  let {guest=false,afterglow=false,onExit,busy=$bindable(false)}:{guest?:boolean;afterglow?:boolean;onExit?:()=>void;busy?:boolean}=$props();
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
    return notes.map((body,i)=>({id:hashPage('lacuna-coast-'+i).toString(16).padStart(32,'0'),user_id:'guest',body,
      created_at:1609459200+i*49171,solidified_at:1609459200+i*49171,kept_at:null}));
  }
  let canvas:HTMLCanvasElement,dialog:HTMLDialogElement;
  let entries=$state.raw<EntryData[]>([]),scene=$state.raw<Awaited<ReturnType<typeof createHarbor>>|null>(null);
  let ready=$state(false),paused=$state(false),graphicsError=$state(false),error=$state(''),notice=$state('');
  let painted=$state(true),readId=$state('');
  const valleyViews=['City','Overlook'] as const;
  let panel=$state<'write'|'pages'|'read'>('write'),draft=$state(''),draftId='',alive=false,reveal=false;
  const ordered=$derived([...entries].sort((a,b)=>b.created_at-a.created_at||b.id.localeCompare(a.id)));
  const latest=$derived(ordered[0]);
  const plan=$derived(paintedCoast(entries));
  const openedPage=$derived(entries.find(entry=>entry.id===readId));
  const opening=$derived((!ready||!scene)&&!error&&!graphicsError);
  const date=new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'});
  async function read(){
    try{const pages=guest?examples():(await api.village.get()).entries;if(alive){entries=pages;ready=true;error='';}}
    catch{if(alive)error='Your journal could not be opened.';}
  }
  async function graphics(){
    graphicsError=false;
    try{
      const {createHarbor}=await import('$lib/town/harbor.js');
      if(!alive)return;
      const city=await createHarbor(canvas,id=>{readId=id;void open('read');},afterglow);
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
  async function open(which:'write'|'pages'|'read'){
    panel=which;error='';await tick();dialog.showModal();
    if(which==='write')dialog.querySelector('textarea')?.focus();
  }
  async function save(){
    const body=draft.trim();if(!body||busy||!ready)return;
    draftId ||= crypto.randomUUID().replaceAll('-','');
    const version=sessionVersion.value;busy=true;error='';
    try{
      const now=Math.floor(Date.now()/1000);
      const entry=guest?{id:draftId,body,user_id:'guest',created_at:now,solidified_at:now,kept_at:null}:(await api.city.write(body,now,draftId)).entry;
      if(!alive||version!==sessionVersion.value)return;
      if(!guest)prependEntry(entry);
      reveal=true;entries=[...entries.filter(e=>e.id!==entry.id),entry];draft='';draftId='';dialog.close();
      notice='Page saved.';
    }catch{if(alive)error='Your writing is still here. Try saving again.';}
    finally{if(alive)busy=false;}
  }
</script>

<main class="coast" aria-label="Journal city">
  <canvas bind:this={canvas} inert={opening} tabindex="0" aria-label="A city growing along the valley river. Drag or use arrow keys to orbit, right-drag to pan, and scroll or pinch to zoom. Home returns to the city. Select a building to read its page."></canvas>
  {#if opening}<ValleyLoading label={ready?'Opening the valley…':'Opening your journal…'} onExit={guest?onExit:undefined}/>{/if}
  <div class="upper" inert={opening}>
    <div class="scope">{guest?'Example city':'Your city'}</div>
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
      <h1>{entries.length?'The valley city':'An unwritten valley'}</h1>
      {#if latest}<p class="detail">{entries.length} {entries.length===1?'page':'pages'} <span>·</span> Last written {date.format(latest.created_at*1000)}</p>
      {:else if ready}<p class="detail">Your first page begins the city.</p>{/if}
    </div>
    <div class="actions">
      {#if graphicsError}<button onclick={graphics}>Retry city</button>{/if}
      {#if !ready&&error}<button onclick={read}>Retry journal</button>{/if}
      <button class="write" disabled={!ready||busy} onclick={()=>open('write')}>Write a page <span aria-hidden="true">↗</span></button>
    </div>
  </div>
  <dialog bind:this={dialog} aria-labelledby="journal-heading" oncancel={e=>{if(busy)e.preventDefault();}}>
    <div class="paper">
      <button class="close" aria-label="Close" disabled={busy} onclick={()=>dialog.close()}>×</button>
      <h2 id="journal-heading">{panel==='write'?'A new page':panel==='read'?'A city page':'Your pages'}</h2>
      {#if guest}<p class="note">Example journal · Changes last for this visit.</p>{/if}
      {#if panel==='write'}
        <form onsubmit={event=>{event.preventDefault();void save();}}>
          <label for="entry">What’s on your mind?</label>
          <textarea id="entry" rows="6" maxlength="500" required bind:value={draft} oninput={()=>draftId=''}></textarea>
          <button disabled={busy||!ready||!draft.trim()} class="ink">{busy?'Saving…':'Save page'}</button>
        </form>
      {:else if panel==='read' && openedPage}
        <article><time datetime={new Date(openedPage.created_at*1000).toISOString()}>{date.format(openedPage.created_at*1000)}</time><p>{openedPage.body}</p></article>
      {:else}
        {#each ordered as page (page.id)}
          <article><time datetime={new Date(page.created_at*1000).toISOString()}>{date.format(page.created_at*1000)}</time><p>{page.body}</p>
            {#if scene && plan.addresses.has(page.id)}<button class="visit-site" onclick={()=>{dialog.close();scene?.visit('Page',page.id);}}>Visit in city <span aria-hidden="true">↗</span></button>{/if}
          </article>
        {:else}<p>Your saved pages will appear here.</p>{/each}
      {/if}
      {#if error}<p role="alert">{error}</p>{/if}
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
  .tools .finish[aria-pressed=true]{color:#243733;background:#e5d9bf;border-color:#e5d9bf}
  @media(max-width:520px){.upper{align-items:flex-start;flex-wrap:wrap}.tools{flex-wrap:wrap;justify-content:flex-end}}
  .tools .motion{width:44px;padding:0}.bottom{bottom:0;padding-block:3.6rem clamp(1.4rem,4vh,3rem);background:linear-gradient(transparent,#13232fee);align-items:flex-end}
  h1,h2{font:400 clamp(2.25rem,4vw,4.3rem)/1 var(--font-reading);margin:0;letter-spacing:-.055em}
  .status,.detail{margin:.55rem 0 0;color:#f2e5d7;font:.94rem/1.4 var(--font-ui)}.status{margin:0 0 .4rem}.status:empty{display:none}.detail span{margin:0 .35rem}
  .actions .write,.ink{background:#f5eadb;color:#202b36;border:1px solid #f5eadb;padding:.8rem 1.15rem}.write span{margin-left:1rem}
  dialog{inset:auto var(--gutter) 4vh auto;margin:0;background:#f6eee2;color:#332e30;width:min(32rem,calc(100% - 2rem));max-height:78dvh;border:1px solid #baa897;border-radius:4px;box-shadow:0 1rem 4rem #12213540}
  dialog::backdrop{background:#1724323c}.paper{padding:clamp(1.3rem,3vw,2.6rem);position:relative}.paper h2{font-size:2.7rem;padding-right:1.8rem}.close{position:absolute;right:.5rem;top:.4rem;font-size:1.6rem;width:44px;background:none;border:0;color:inherit}
  .viewpoints{display:flex;align-items:center;gap:.15rem;width:fit-content;margin-bottom:.65rem;pointer-events:auto}
  .bottom .viewpoints button{border:0;border-bottom:1px solid #f4e5cf80;border-radius:0;background:#172d30c4;font-size:.78rem;padding:.48rem .76rem;min-height:44px}
  .bottom .viewpoints button:hover,.bottom .viewpoints button:focus-visible{background:#354e50}
  .visit-site{color:#34534c;padding:0;background:none;border:none;text-decoration:underline;text-underline-offset:.2em}
  .note,time,label{font:.85rem/1.4 var(--font-ui);color:#675d59}form{display:grid;gap:.7rem;margin-top:1.5rem}
  textarea{width:100%;resize:vertical;background:#fffbf3;color:inherit;border:1px solid #b5a59b;border-radius:2px;padding:.8rem;font:1.2rem/1.5 var(--font-reading)}
  .ink{justify-self:end;background:#24333f;border-color:#24333f;color:#fff3e0;border-radius:3px}button:disabled{opacity:.58;cursor:default}
  article{border-top:1px solid #c7b9ab;padding-top:.9rem;margin-top:1rem}article p{font:1.27rem/1.45 var(--font-reading);white-space:pre-wrap;overflow-wrap:anywhere;margin:.3rem 0}
  @media(max-width:600px){.bottom{flex-wrap:wrap}.upper{gap:.4rem}.upper button{padding:.5rem .65rem}.scope{font-size:.73rem}.tools{gap:.2rem}dialog{right:1rem;bottom:1rem}.detail{font-size:.81rem}}
</style>
