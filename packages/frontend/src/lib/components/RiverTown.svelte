<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api, type EntryData } from '$lib/api.js';
  import { prependEntry } from '$lib/stores/entries.svelte.js';
  import { sessionVersion } from '$lib/session-version.js';
  import { canSettle, home, occupations, population, residentName, shiftSeconds, sites, suggest, trades, workday, type Trade } from '../../../../shared/river.js';
  import type { createScene } from '$lib/town/scene.js';

  let {busy=$bindable(false)}:{busy?:boolean}=$props();
  let data=$state.raw<Awaited<ReturnType<typeof api.town.get>>|null>(null);
  let view=$state<'write'|'place'|'site'|'day'>('write'), body=$state(''), trade=$state<Trade>('grower');
  let site=$state(-1), person=$state(''), pendingId='', error=$state(''), arrival=$state('');
  let canvas:HTMLCanvasElement, panel:HTMLElement, heading=$state<HTMLElement>();
  let scene=$state.raw<ReturnType<typeof createScene>|null>(null), graphicsError=$state(''), help=$state(false);
  let alive=false, readId=0;
  const lots=$derived(population(data?.entries??[]));
  const flow=$derived(workday(lots,data?.clock.grain??[2,1]));
  const eligible=$derived(sites.map((s,i)=>({...s,i})).filter(s=>canSettle(lots,{trade,site:s.i})));
  const residents=$derived((data?.entries??[]).filter(e=>home(e).site===site));
  const entry=$derived(residents.find(e=>e.id===person));
  const bank=$derived(sites[site]?.bank??0);
  const plan=$derived(data && view==='place' && site>=0 ? workday(population([...data.entries,{id:'preview',body,settlement:{trade,site}}]),data.clock.grain):null);
  async function refresh(){
    const id=++readId;
    try{
      const next=await api.town.get();
      if(alive && id===readId){data=next;error='';}
    }catch(e){if(alive&&id===readId)error=e instanceof Error?e.message:'Could not open your town.';}
  }
  async function graphics(){
    graphicsError='';
    try{
      const [{loadModels},{createScene:build}]=await Promise.all([import('$lib/town/landscape.js'),import('$lib/town/scene.js')]);
      if(!alive)return;
      const library=await loadModels();
      if(alive)scene=build(canvas,library,chooseSite);
    }catch{if(alive)graphicsError='The 3D view could not open. Check that graphics acceleration is enabled, then try again.';}
  }
  onMount(()=>{
    alive=true;void refresh();void graphics();
    const timer=setInterval(()=>{if(!document.hidden&&!busy&&data&&Date.now()/1000>=data.clock.at+shiftSeconds)void refresh();},3000);
    const wake=()=>{if(!document.hidden&&!busy)void refresh();};
    document.addEventListener('visibilitychange',wake);
    return ()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',wake);scene?.destroy();};
  });
  $effect(()=>{if(scene&&data)scene.update(data);});
  $effect(()=>{scene?.select(site,person);});
  function reveal(){
    void tick().then(()=>{heading?.focus({preventScroll:true});if(matchMedia('(max-width: 780px)').matches)panel?.scrollIntoView({block:'nearest'});});
  }
  function chooseSite(index:number,id=''){
    if(busy)return;
    if(view==='place'){
      if(canSettle(lots,{trade,site:index}))site=index;
      return;
    }
    site=index;person=id;view='site';arrival='';reveal();
  }
  function interpret(){
    if(!body.trim() || !data)return;
    trade=suggest(body);site=sites.findIndex((s,i)=>s.trade===null&&canSettle(lots,{trade,site:i}));
    if(site<0)site=trades.indexOf(trade);
    person='';view='place';arrival='';error='';reveal();
  }
  function changeTrade(value:Trade){
    trade=value;if(!canSettle(lots,{trade,site}))site=trades.indexOf(trade);
  }
  async function settle(){
    if(!data||busy||!body.trim()||!canSettle(lots,{trade,site}))return;
    busy=true;error='';const version=sessionVersion.value;
    pendingId ||= crypto.randomUUID().replaceAll('-','');
    try{
      const {entry:saved}=await api.entries.create(body.trim(),Math.floor(Date.now()/1000),pendingId,{trade,site});
      if(!alive||version!==sessionVersion.value)return;
      prependEntry(saved);body='';pendingId='';person=saved.id;site=home(saved).site;
      data={...data,entries:[...data.entries.filter(e=>e.id!==saved.id),saved]};
      arrival=residentName(saved.id)+' has arrived.';view='site';reveal();
      await refresh();
    }catch(e){
      if(alive){await refresh();error=e instanceof Error?e.message:'Your thought is still here. Try again.';}
    }finally{if(alive)busy=false;}
  }
  async function nextDay(){
    if(!data||busy)return;
    busy=true;readId++;error='';
    try{const next=await api.town.nextDay(data.clock.day);if(alive)data=next;}
    catch(e){if(alive)error=e instanceof Error?e.message:'Could not advance the town.';}
    finally{if(alive)busy=false;}
  }
  function write(){view='write';person='';site=-1;arrival='';error='';}
  function nameOf(e:EntryData){return residentName(e.id);}
</script>

<main class="town">
  <div class="spread">
    <section class="map" aria-label="Willowmere town map">
      <canvas bind:this={canvas} tabindex="0" aria-label="3D town. Drag to rotate, right-drag to pan, scroll to zoom. Arrow keys pan, Q and E rotate, plus and minus zoom."></canvas>
      <div class="map-title"><h1>Willowmere</h1><p>Day {data?.clock.day??1} <span>·</span> {(data?.entries.length??0)+12} residents</p></div>
      {#if graphicsError}<div class="map-message" role="alert">{graphicsError}<button onclick={graphics}>Retry 3D view</button></div>
      {:else if !scene}<p class="map-message" role="status">Opening the river valley…</p>{/if}
      <div class="camera" aria-label="Camera controls">
        <button aria-label="Rotate left" onclick={()=>scene?.action('left')}>↶</button><button aria-label="Rotate right" onclick={()=>scene?.action('right')}>↷</button>
        <button aria-label="Zoom out" onclick={()=>scene?.action('out')}>−</button><button aria-label="Zoom in" onclick={()=>scene?.action('in')}>+</button>
        <button aria-label="Center town" onclick={()=>scene?.action('home')}>⌖</button>
        <button aria-label="Camera instructions" aria-expanded={help} onclick={()=>help=!help}>?</button>
      </div>
      {#if help}<p class="help">Drag to rotate. Right-drag to pan. Scroll to zoom. On touchscreens, use two fingers to move or pinch.</p>{/if}
    </section>
    <section class="folio" bind:this={panel} aria-label="Town journal">
      <div class="tabs">
        <button class:active={view!=='day'} disabled={busy} onclick={write}>Town journal</button>
        <button class:active={view==='day'} disabled={busy} onclick={()=>{view='day';person='';site=-1;}}>Town ledger</button>
      </div>
      {#if view==='write'}
        <h2>Leave a thought.</h2>
        <p>Your words bring a resident to the river.</p>
        <label class="visually-hidden" for="town-thought">Your thought</label>
        <textarea id="town-thought" maxlength="500" bind:value={body} oninput={()=>pendingId=''} placeholder="What’s on your mind?" onkeydown={e=>{if(!e.isComposing&&(e.ctrlKey||e.metaKey)&&e.key==='Enter')interpret();}}></textarea>
        <button class="primary" disabled={!body.trim()||!data} onclick={interpret}>Meet the resident</button>
        <div class="places"><h3>Along the river</h3>
        {#each sites as s,i}<button onclick={()=>chooseSite(i)}><span>{s.name}</span><small>{lots[i].trade?occupations[lots[i].trade!].place:'open land'}</small></button>{/each}</div>
      {:else if view==='place'}
        <h2 bind:this={heading} tabindex="-1">A new neighbor.</h2>
        <label for="trade">Their work</label>
        <select id="trade" disabled={busy} value={trade} onchange={e=>changeTrade(e.currentTarget.value as Trade)}>{#each trades as t}<option value={t}>{occupations[t].name}</option>{/each}</select>
        <p>{occupations[trade].work}</p>
        <label for="site">Where to settle</label>
        <select id="site" disabled={busy} bind:value={site}>{#each eligible as s}<option value={s.i}>{s.name} · {s.bank?'East':'West'} bank</option>{/each}</select>
        {#if plan}<div class="forecast"><h3>Meals within reach</h3><p>{bank?'East':'West'} bank <b>{flow.fed[bank]} → {plan.fed[bank]}</b></p><p>Residents on this bank <b>{plan.demand[bank]}</b></p></div>{/if}
        <button class="primary" disabled={busy||!eligible.some(s=>s.i===site)} onclick={settle}>{busy?'Settling…':'Settle here'}</button>
        <button class="secondary" disabled={busy} onclick={write}>Back to my words</button>
      {:else if view==='site' && site>=0}
        <h2 bind:this={heading} tabindex="-1">{sites[site].name}</h2>
        <p>{bank?'East':'West'} bank · {lots[site].trade?occupations[lots[site].trade!].place:'Open land'}</p>
        {#if arrival}<p class="arrival" role="status">{arrival}</p>{/if}
        {#if entry}
          <h3>{nameOf(entry)} · {occupations[home(entry).trade].name}</h3>
          <blockquote>{entry.body}</blockquote>
        {:else if lots[site].trade}<p>{occupations[lots[site].trade!].work}</p>
        {:else}<p>A resident can establish a workplace here.</p>{/if}
        {#if residents.length}
          <label for="residents">Thought-born residents</label><select id="residents" bind:value={person}><option value="">Choose a resident</option>{#each residents as r}<option value={r.id}>{nameOf(r)}</option>{/each}</select>
        {/if}
        <button class="secondary" onclick={()=>scene?.focus()}>{entry?'Follow resident':'Look closer'}</button>
        <div class="forecast"><h3>Today on this bank</h3><p>Residents fed <b>{flow.fed[bank]} / {flow.demand[bank]}</b></p><p>Grain delivered <b>{flow.grainMoved[bank]}</b></p><p>Meals delivered <b>{flow.mealsMoved[bank]}</b></p></div>
        <button class="primary" onclick={write}>{body?'Resume writing':'Write a thought'}</button>
      {:else if view==='day'}
        <h2>Day {data?.clock.day??1}</h2><p>Food and travel on the river today.</p>
        {#each [0,1] as b}<div class="forecast"><h3>{b?'East':'West'} bank</h3><p>Grain harvested <b>{flow.harvest[b]}</b></p><p>Meals cooked <b>{flow.cooked[b]}</b></p><p>Deliveries received <b>{flow.grainMoved[b]} grain · {flow.mealsMoved[b]} meals</b></p><p>Residents fed <b>{flow.fed[b]} / {flow.demand[b]}</b></p></div>{/each}
        <button class="primary" disabled={busy||!data} onclick={nextDay}>Next morning</button>
      {/if}
      {#if error}<p role="alert">{error}</p>{#if !data}<button onclick={refresh}>Try again</button>{/if}{/if}
    </section>
  </div>
</main>

<style>
  .town{height:100%;overflow:auto;background:var(--paper);color:var(--ink);font-family:var(--font-reading);--forest:var(--ink)}
  .tabs,.camera{display:flex;align-items:center;gap:8px}.town button,.town select{font:inherit;color:inherit;cursor:pointer}.town button{border:0;background:transparent;padding:8px 11px;min-height:40px}
  .tabs button,.places small,label,.forecast p,.map-title p,.help{font-family:system-ui,sans-serif;font-size:.85rem}
  .spread{min-height:100%;display:grid;grid-template-columns:minmax(0,1fr) clamp(305px,26vw,420px)}
  .map{position:sticky;top:0;align-self:start;height:calc(100dvh - var(--mast-height));min-height:380px;background:var(--valley);overflow:hidden}
  canvas{height:100%;width:100%;display:block;touch-action:none;cursor:grab}canvas:active{cursor:grabbing}
  .map-title{position:absolute;top:clamp(15px,3vh,35px);left:clamp(18px,3.5vw,55px);pointer-events:none}
  h1,h2,h3{font-weight:400;line-height:1.12}.map-title h1{font-size:clamp(2.25rem,5vw,4.75rem);letter-spacing:-.06em}.map-title p{margin-top:6px}.map-title span{margin:0 4px}
  .camera,.help,.map-message{position:absolute;background:var(--paper);border:1px solid #c8d2c3;border-radius:12px}.camera{bottom:16px;left:50%;transform:translateX(-50%);padding:1px 4px;gap:0}.camera button{font:1.25rem system-ui;width:40px}.help,.map-message{padding:10px 14px;text-align:center}.help{bottom:68px;left:10%;right:10%}.map-message{top:45%;left:12%;right:12%}
  .folio{padding:clamp(20px,3vw,46px);border-left:1px solid var(--line)}.tabs{border-bottom:1px solid var(--line);margin-bottom:30px;gap:17px}.tabs button{padding:4px 0 11px;border-bottom:2px solid transparent}.tabs .active{border-color:var(--forest);font-weight:600}
  .folio h2{font-size:clamp(2rem,3vw,3rem);letter-spacing:-.045em;margin-bottom:9px}.folio h3{font-size:1.18rem;margin:15px 0 10px}.folio>p{color:var(--muted);line-height:1.5;margin:6px 0 16px}
  textarea,select{width:100%;border:1px solid #bbc8b8;border-radius:7px;color:var(--ink);background:var(--paper);padding:10px;font:inherit}textarea{margin:4px 0 10px;min-height:95px;resize:vertical}label{display:block;margin:17px 0 5px}
  button.primary{background:var(--forest);border-radius:7px;color:#fffdf1;padding:9px 18px;width:100%;min-height:48px;font:600 .94rem var(--font-ui)}.secondary{display:block;margin:6px auto}
  .forecast,.places{border-top:1px solid var(--line);margin:22px 0 16px;padding-top:3px}.forecast p,.places button{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.forecast p{margin:5px 0}.forecast b{font-weight:550}.places button{width:100%;padding:7px 0;text-align:left}.places small{color:var(--muted)}
  blockquote{border-left:2px solid #9eb092;padding:8px 14px;white-space:pre-wrap;overflow-wrap:anywhere}.arrival{font-style:italic}
  .town :focus-visible{outline:2px solid #536e57;outline-offset:2px}.town button:hover{color:#66764b}.town button.primary:hover{color:white;background:#41644f}
  @media(max-width:780px){.spread{display:block}.map{position:relative;height:51dvh;min-height:300px}.map-title{top:10px}.map-title h1{font-size:2rem}.map-title p{margin-top:0}.camera{bottom:6px}.camera button{width:44px;min-height:44px}.folio{border-left:0;padding:16px 22px 40px}.tabs{margin-bottom:16px}.folio h2{font-size:2rem}.help{bottom:58px}.places{margin-top:18px}}
</style>
