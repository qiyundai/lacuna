<script lang="ts">
  import { aiAvailable } from '../../../../shared/ai-release.js';
  import { onMount } from 'svelte';
  import { browserVault, type WebJournal } from '$lib/web-vault.js';
  import { lenses, writingDay, type Page } from '../../../../shared/living-book.js';
  import { dateLabel, downloadFile } from '$lib/story.js';
  let { map=false }:{map?:boolean}=$props();
  let journal=$state.raw<WebJournal|null>(null), edition=$state(0);
  onMount(()=>{
    const reload=()=>{const vault=browserVault();journal=vault.unlocked?vault.read():null;};
    reload();window.addEventListener('lacuna:journal-changed',reload);
    return ()=>window.removeEventListener('lacuna:journal-changed',reload);
  });
  const pages=$derived(new Map(journal?.entries.map(p=>[p.id,p])));
  const chapters=$derived(journal?.book?.chapters??[]);
  const editions=$derived(chapters.flatMap(c=>c.passages).filter(p=>p.prose).sort((a,b)=>b.edition-a.edition));
  const cutoff=$derived(editions.some(p=>p.edition===edition)?edition:0);
  const visible=$derived(chapters.map(c=>({...c,passages:c.passages.filter(p=>p.prose && (!cutoff || p.edition<=cutoff))})).filter(c=>c.passages.length));
  const readings=$derived(chapters.flatMap(c=>c.passages.flatMap(p=>p.readings.map(r=>({p,r})))));
  const threads=$derived.by(()=>{
    const groups=new Map<string,Map<string,string>>();
    for(const [id,notes] of Object.entries(journal?.book?.notes??{})){
      for(const note of notes){
        const topic=note.topic.toLowerCase();
        const sources=groups.get(topic)??new Map<string,string>();
        sources.set(id,note.quote);groups.set(topic,sources);
      }
    }
    return [...groups].filter(([,ids])=>new Set([...ids.keys()].map(id=>writingDay(pages.get(id)!))).size>=2)
      .sort(([,a],[,b])=>Math.max(...[...b.keys()].map(id=>pages.get(id)!.created_at))-Math.max(...[...a.keys()].map(id=>pages.get(id)!.created_at)));
  });
  const dated=(ids:string[])=>ids.flatMap(id=>pages.get(id)??[]).sort((a,b)=>a.created_at-b.created_at);
  const pageDate=(p:Page)=>dateLabel(writingDay(p)*86400,{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'});
  function period(ids:string[]){
    const items=dated(ids),first=items[0],last=items.at(-1);
    if(!first || !last)return '';
    const start=pageDate(first),end=pageDate(last);
    return start===end?start:start+' – '+end;
  }
  function save(){
    const sections=visible.map(c=>['## '+(c.passages[0]?.title || period(c.pages)),...c.passages.map(p=>p.prose)].join('\n\n'));
    downloadFile(['# Living memoir',...sections].join('\n\n'),'lacuna-memoir.md','text/markdown;charset=utf-8');
  }
</script>
{#snippet evidence(ids:string[])}
  <details><summary>Source pages · {ids.length}</summary>
    {#each dated(ids) as source}
      <div class="source"><time>{pageDate(source)}</time><p>{source.body}</p></div>
    {/each}
  </details>
{/snippet}
<section class="book" aria-label={map?'Soul map':'Living memoir'}>
  <header><h1>{map?'Soul map':'Living memoir'}</h1>
    {#if !aiAvailable}<p>Coming soon</p>{/if}
    {#if !map && editions.length>1}
      <label>Edition <select bind:value={edition}><option value={0}>Current telling</option>
        {#each editions.slice(1) as e}<option value={e.edition}>{dateLabel(e.written)} · {e.edition}</option>{/each}
      </select></label>
    {/if}
  </header>
  {#if map}
    {#if threads.length}<article><h2>Recurring threads</h2>
      {#each threads as [topic,sources]}<details><summary>{topic} · {period([...sources.keys()])}</summary>
        {#each dated([...sources.keys()]) as source}<div class="source"><time>{pageDate(source)}</time><p>{sources.get(source.id)}</p></div>{/each}
      </details>{/each}
    </article>{/if}
    {#each Object.entries(lenses) as [id,label]}
      {@const matches=readings.filter(({r})=>r.lens===id)}
      {#if matches.length}<article><h2>{label}</h2>
        {#each matches as {r}}<div class="passage"><time>{period(r.support)}</time><p>{r.text}</p>{@render evidence(r.support)}</div>{/each}
      </article>{/if}
    {/each}
    {#if !readings.length && !threads.length}<p class="empty">Your Soul Map will connect recurring threads to the pages where they appear.</p>{/if}
  {:else}
    {#each visible as c (c.id)}
      <article><time>{period(c.passages.flatMap(p=>p.pages))}</time><h2>{c.passages[0]?.title || 'Pages from '+pageDate(dated(c.passages[0]!.pages)[0]!)}</h2>
        {#each c.passages as p (p.id)}<div class="passage"><p>{p.prose}</p>{@render evidence(p.sources)}</div>{/each}
      </article>
    {:else}<p class="empty">Your memoir will gather pages from different days into chapters.</p>{/each}
    {#if visible.length}<button class="atlas-link" onclick={save}>Export this edition</button>{/if}
  {/if}
</section>
<style>
  .book{max-width:var(--measure-page);margin:0 auto;padding:clamp(var(--space-8),11vh,var(--space-9)) var(--gutter) var(--space-9);color:var(--ink);font-family:var(--font)}
  header{padding-bottom:var(--space-5);border-bottom:1px solid var(--rule)}
  h1{font:400 var(--display-1)/var(--lh-display) var(--font);letter-spacing:var(--ls-display);text-wrap:balance}
  h2{margin:var(--space-2) 0 var(--space-5);font:400 var(--display-3)/var(--lh-heading) var(--font);letter-spacing:var(--ls-heading);text-wrap:balance}
  article{padding-top:var(--space-7)}
  .passage{margin-bottom:var(--space-5)}
  .passage>p,.empty{font:400 var(--text-lg)/var(--lh-prose) var(--font);letter-spacing:var(--ls-prose);color:var(--ink-muted);white-space:pre-line;overflow-wrap:anywhere;text-wrap:pretty}
  time,summary,label{font:400 var(--ui-sm)/var(--lh-ui) var(--font);letter-spacing:var(--ls-ui);color:var(--ink-subtle)}
  summary{width:fit-content;min-height:var(--control);display:flex;align-items:center;cursor:pointer;color:var(--ink-muted)}
  summary:hover{color:var(--ink)}
  label{display:flex;align-items:center;gap:var(--space-3);margin-top:var(--space-4)}
  select{min-height:var(--control);padding:0 var(--space-1);border:0;border-bottom:1px solid var(--line-strong);border-radius:0;background:transparent;color:var(--ink);font:400 var(--ui-md) var(--font);cursor:pointer}
  .source{margin:var(--space-4) 0;padding:0 var(--space-4);border-left:1px solid var(--line)}
  .source p{margin-top:var(--space-1);font:400 var(--text-sm)/var(--lh-prose) var(--font);color:var(--ink-muted);white-space:pre-line;overflow-wrap:anywhere}
</style>
