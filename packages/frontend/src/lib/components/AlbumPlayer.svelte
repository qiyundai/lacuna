<script lang="ts">
  import { onMount, tick } from 'svelte';
  import PlayerIcon from './PlayerIcon.svelte';
  import { deviceAlbum, deviceTracks, importMusic, loadAlbums, readAudio, removeMusic, type Track } from '$lib/music-library.js';
  import { musicWindow } from '$lib/music-window.svelte.js';
  import { readLocal, writeLocal } from '$lib/storage.js';

  let audio: HTMLAudioElement;
  let picker: HTMLInputElement;
  let folderPicker: HTMLInputElement;
  let importOptions = $state(false);
  let panel: HTMLElement;
  let bundled = $state.raw<Track[]>([]);
  let imported = $state.raw<Track[]>([]);
  let tracks = $derived([...bundled, ...imported]);
  let byId = $derived(new Map(tracks.map(track => [track.id, track])));
  let albums = $derived([...new Set(tracks.map(track => track.album))]);
  let selected = $state('');
  let current = $derived(byId.get(selected) ?? tracks[0]);
  let filter = $state('');
  let album = $state('');
  let view = $state<'library' | 'queue'>('library');
  let queue = $state<string[]>([]);
  let history: string[] = [];
  let heard = new Set<string>();
  let needle = $derived(filter.trim().toLocaleLowerCase());
  let matches = $derived(tracks.filter(track => (!album || track.album === album) &&
    (!needle || (track.title + ' ' + track.album).toLocaleLowerCase().includes(needle))));
  let queued = $derived(queue.flatMap((id, position) => {
    const track = byId.get(id);
    return track ? [{ track, position }] : [];
  }));
  let rows = $derived(view === 'queue' ? queued.map(entry => entry.track) : matches);
  let limit = $state(50);
  let shuffled = $state(false);
  let repeat = $state<'off' | 'all' | 'one'>('all');
  let volume = $state(0.45);
  let muted = $state(false);
  let playing = $state(false);
  let position = $state(0);
  let duration = $state(0);
  let importing = $state(false);
  let loading = $state(true);
  let notice = $state('');
  let error = $state('');
  let libraryError = $state('');
  let prefsReady = $state(false);
  let started = false;
  let sourceId = '';
  let objectURL = '';
  let request = 0;

  function time(seconds: number) {
    const value = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
  }

  async function load() {
    loading = true;
    libraryError = '';
    const [albumsResult, localResult] = await Promise.allSettled([loadAlbums(), deviceTracks()]);
    if (albumsResult.status === 'fulfilled') {
      bundled = albumsResult.value.tracks;
      if (albumsResult.value.missing.length) libraryError = 'Some album playlists could not load.';
    } else libraryError = 'The soundtrack library could not load.';
    if (localResult.status === 'fulfilled') imported = localResult.value;
    else libraryError += ' Device music storage is unavailable.';
    if (!libraryError) queue = queue.filter(id => byId.has(id));
    loading = false;
  }

  function dequeue(index: number) {
    const entry = queued[index];
    if (entry) queue.splice(entry.position, 1);
    return entry?.track;
  }

  $effect(() => {
    if (musicWindow.mode !== 'closed' && !started) {
      started = true;
      void load();
    }
  });

  onMount(() => {
    if (location.hash === '#soundtrack') musicWindow.mode = 'library';
    let prefs;
    try { prefs = JSON.parse(readLocal('lacuna_music_player') ?? '{}'); } catch { prefs = {}; }
    if (typeof prefs?.volume === 'number') volume = Math.min(1, Math.max(0, prefs.volume));
    muted = prefs?.muted === true;
    shuffled = prefs?.shuffled === true;
    if (['off', 'one', 'all'].includes(prefs?.repeat)) repeat = prefs.repeat;
    if (typeof prefs?.selected === 'string') selected = prefs.selected;
    if (Array.isArray(prefs?.queue)) queue = prefs.queue.filter((id: unknown) => typeof id === 'string');
    prefsReady = true;
    return () => { ++request; audio?.pause(); if (objectURL) URL.revokeObjectURL(objectURL); };
  });

  $effect(() => {
    if (!prefsReady) return;
    audio.volume = volume;
    audio.muted = muted;
    writeLocal('lacuna_music_player', JSON.stringify({ volume, muted, shuffled, repeat, selected, queue }));
  });

  function release() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = '';
    sourceId = '';
    duration = 0;
    position = 0;
  }

  async function play(track: Track, remember = true) {
    const token = ++request;
    error = '';
    notice = '';
    if (current && current.album !== track.album) heard.clear();
    if (remember && current && current.id !== track.id) history.push(current.id);
    selected = track.id;
    heard.add(track.id);
    try {
      if (sourceId !== track.id || audio.error) {
        release();
        let url = track.url;
        if (!url) {
          const blob = await readAudio(track.id);
          if (token !== request) return;
          if (!blob) throw new Error();
          objectURL = URL.createObjectURL(blob);
          url = objectURL;
        }
        sourceId = track.id;
        audio.src = url;
      }
      await audio.play();
    } catch (cause) {
      if (token === request && !(cause instanceof DOMException && cause.name === 'AbortError'))
        error = 'Could not play this track. Try again or choose another.';
    }
  }

  function toggle() {
    if (!audio.paused) { ++request; audio.pause(); }
    else if (current) void play(current);
  }

  function next(ended = false) {
    if (!current) return;
    if (ended && repeat === 'one') { audio.currentTime = 0; void play(current); return; }
    const nextQueued = dequeue(0);
    if (nextQueued) {
      if (sourceId === nextQueued.id) audio.currentTime = 0;
      void play(nextQueued);
      return;
    }
    const sequence = tracks.filter(track => track.album === current?.album);
    let target;
    if (shuffled) {
      heard.add(current.id);
      let remaining = sequence.filter(track => !heard.has(track.id));
      if (!remaining.length) {
        if (ended && repeat === 'off') return;
        heard.clear();
        remaining = sequence.filter(track => track.id !== current?.id);
      }
      target = remaining[Math.floor(Math.random() * remaining.length)] ?? current;
    } else {
      const index = sequence.findIndex(track => track.id === current?.id);
      if (ended && repeat === 'off' && index === sequence.length - 1) return;
      target = sequence[(index + 1) % sequence.length];
    }
    if (target.id === current.id && sourceId === current.id) audio.currentTime = 0;
    void play(target);
  }

  function previous() {
    if (!current) return;
    if (sourceId && audio.currentTime > 3) { audio.currentTime = 0; return; }
    const last = history.pop();
    const sequence = tracks.filter(track => track.album === current?.album);
    const index = sequence.findIndex(track => track.id === current?.id);
    void play((last && byId.get(last)) || sequence[(index - 1 + sequence.length) % sequence.length], false);
  }

  async function addFiles(event: Event & { currentTarget: HTMLInputElement }) {
    const selection = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!selection.length) return;
    const files = selection.filter(file => file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|weba|aif|aiff)$/i.test(file.name));
    if (!files.length) { notice = 'Choose audio files to import.'; return; }
    importing = true;
    try {
      const before = new Set(imported.map(track => track.id));
      await importMusic(files);
      imported = await deviceTracks();
      const count = imported.filter(track => !before.has(track.id)).length;
      const folders = new Set(files.map(file => file.webkitRelativePath?.split('/').at(-2) || deviceAlbum));
      album = folders.size === 1 ? [...folders][0] : ''; filter = ''; view = 'library'; limit = 50;
      notice = count ? 'Added ' + count + (count === 1 ? ' track' : ' tracks') + ' on this device.' : 'These tracks are already in your library.';
      if (files.length < selection.length) notice += ' Skipped non-audio files.';
    } catch { notice = 'Import failed. Check the available storage on this device and try again.'; }
    finally { importing = false; }
  }

  async function remove(track: Track) {
    try {
      await removeMusic(track.id);
      if (current?.id === track.id) { ++request; release(); selected = ''; }
      imported = imported.filter(item => item.id !== track.id);
      queue = queue.filter(id => id !== track.id);
      history = history.filter(id => id !== track.id);
      if (!tracks.some(item => item.album === album)) album = '';
      notice = 'Removed ' + track.title + ' from this library.';
    } catch { notice = 'Could not remove this track. Try again.'; }
  }

  async function resize() {
    musicWindow.mode = musicWindow.mode === 'mini' ? 'library' : 'mini';
    await tick(); panel?.focus({ preventScroll: true });
  }

  function close() {
    musicWindow.mode = 'closed';
    musicWindow.opener?.focus({ preventScroll: true });
  }
</script>

<svelte:window onkeydown={event => {
  if (event.key === 'Escape' && musicWindow.mode !== 'closed' && panel?.contains(document.activeElement)) close();
}}/>
<input hidden type="file" multiple accept="audio/*,.flac,.opus,.m4a" bind:this={picker} onchange={addFiles}/>
<input hidden type="file" multiple webkitdirectory bind:this={folderPicker} onchange={addFiles}/>
<audio bind:this={audio} preload="none" onplay={() => playing = true} onpause={() => playing = false}
  ontimeupdate={() => position = audio.currentTime} ondurationchange={() => duration = Number.isFinite(audio.duration) ? audio.duration : 0}
  onerror={() => { if (sourceId) error = 'Could not play this track. Try again or choose another.'; }}
  onended={() => { playing = false; next(true); }}></audio>

{#snippet transport(compact: boolean)}
  <div class="transport">
    {#if !compact}
      <button class:enabled={shuffled} aria-label="Shuffle" aria-pressed={shuffled} title="Shuffle" onclick={() => { shuffled = !shuffled; heard.clear(); }}><PlayerIcon name="shuffle"/></button>
    {/if}
    <button aria-label="Previous track" title="Previous track" disabled={!current} onclick={previous}><PlayerIcon name="previous"/></button>
    <button class="play" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} disabled={!current} onclick={toggle}><PlayerIcon name={playing ? 'pause' : 'play'}/></button>
    <button aria-label="Next track" title="Next track" disabled={!current} onclick={() => next()}><PlayerIcon name="next"/></button>
    {#if !compact}
      <button class:enabled={repeat !== 'off'} aria-label={'Repeat: ' + repeat} title={'Repeat: ' + repeat}
        onclick={() => repeat = repeat === 'all' ? 'one' : repeat === 'one' ? 'off' : 'all'}><PlayerIcon name="repeat"/>{#if repeat === 'one'}<sup>1</sup>{/if}</button>
    {/if}
  </div>
{/snippet}

<aside id="soundtrack" aria-label="Music player" bind:this={panel} tabindex="-1" hidden={musicWindow.mode === 'closed'} class:mini={musicWindow.mode === 'mini'}>
  {#if musicWindow.mode === 'mini'}
    <div class="compact">
      <button class="compact-title" title="Open music library" aria-label="Expand music player" onclick={resize}>
        <small>{current?.album ?? 'Music'}</small><strong>{current?.title ?? 'Library'}</strong>
      </button>
      {@render transport(true)}
      <button aria-label="Close music" title="Close music" onclick={close}><PlayerIcon name="close"/></button>
    </div>
  {:else if musicWindow.mode === 'library'}
    <div class="cover" class:local={current && !current.url}>
      <div class="cover-tools">
        <button aria-label="Minimize player" title="Minimize player" onclick={resize}><PlayerIcon name="minimize"/></button>
        <button aria-label="Close music" title="Close music" onclick={close}><PlayerIcon name="close"/></button>
      </div>
      <div class="caption"><small>{current?.album ?? 'Music library'}</small><h2>{current?.title ?? (loading ? 'Loading music…' : 'Choose a track')}</h2></div>
    </div>
    <div class="deck">
      <div class="timeline">
        <label for="music-seek">{time(position)}</label>
        <input id="music-seek" aria-label="Seek" type="range" min="0" max={duration || current?.seconds || 1} step=".1" value={position}
          disabled={!duration} aria-valuetext={time(position)} oninput={event => audio.currentTime = +event.currentTarget.value}/>
        <span>{time(duration || current?.seconds || 0)}</span>
      </div>
      <div class="deck-controls">
        {@render transport(false)}
        <div class="volume">
          <button title={muted ? 'Unmute' : 'Mute'} aria-label={muted ? 'Unmute' : 'Mute'} onclick={() => muted = !muted}><PlayerIcon name={muted || volume === 0 ? 'muted' : 'volume'}/></button>
          <input id="music-volume" type="range" aria-label="Volume" min="0" max="1" step=".01" value={muted ? 0 : volume}
            oninput={event => { volume = +event.currentTarget.value; muted = false; }}/>
          <label class="level" for="music-volume">{muted ? 0 : Math.round(volume * 100)}%</label>
        </div>
      </div>
    </div>
    <div class="collection">
      <header>
        <div class="views">
          <button aria-pressed={view === 'library'} onclick={() => { view = 'library'; limit = 50; }}>Library</button>
          <button aria-pressed={view === 'queue'} onclick={() => { view = 'queue'; limit = 50; }}>Queue <span>{queued.length}</span></button>
        </div>
        <button class="add" disabled={importing || loading} aria-expanded={importOptions} onclick={() => importOptions = !importOptions}><PlayerIcon name="plus"/>{importing ? 'Adding…' : 'Add music'}</button>
      </header>
      {#if importOptions}
        <div class="import-options">
          <small>Keep music in this browser</small>
          <button onclick={() => { importOptions = false; picker.click(); }}>Choose files</button>
          <button onclick={() => { importOptions = false; folderPicker.click(); }}>Album folder</button>
        </div>
      {/if}
      {#if view === 'library'}
        <div class="filters">
          <label class="search-field">Search<input type="search" aria-label="Search music" placeholder="Title or album" bind:value={filter} oninput={() => limit = 50}/></label>
          <label>Album<select aria-label="Filter by album" bind:value={album} onchange={() => limit = 50}><option value="">All albums</option>{#each albums as name}<option value={name}>{name}</option>{/each}</select></label>
        </div>
      {/if}
      <div class="list" aria-label={view === 'queue' ? 'Queued tracks' : 'Music library'}>
        {#each rows.slice(0, limit) as track, i}
          <div class="row" class:active={current?.id === track.id}>
            <button class="song" aria-label={'Play ' + track.title} aria-current={current?.id === track.id ? 'true' : undefined}
              onclick={() => { if (view === 'queue') dequeue(i); void play(track); }}>
              <span class="number">{#if track.id === current?.id}<PlayerIcon name={playing ? 'volume' : 'note'}/>{:else}{String(i + 1).padStart(2,'0')}{/if}</span>
              <span class="song-title">{track.title}</span><span class="length">{track.seconds ? time(track.seconds) : ''}</span>
            </button>
            {#if view === 'queue'}
              <button aria-label={'Remove ' + track.title + ' from queue'} title="Remove from queue" onclick={() => dequeue(i)}><PlayerIcon name="remove"/></button>
            {:else}
              <button aria-label={'Queue ' + track.title} title="Add to queue" onclick={() => { queue.push(track.id); notice = 'Queued ' + track.title + '.'; }}><PlayerIcon name="queue"/></button>
              {#if !track.url}<button aria-label={'Remove ' + track.title + ' from device library'} title="Remove imported copy" onclick={() => remove(track)}><PlayerIcon name="remove"/></button>{/if}
            {/if}
          </div>
        {:else}
          <p class="empty">{loading ? 'Loading music…' : view === 'queue' ? 'Add tracks from the library to play them next.' : 'No matching tracks.'}</p>
        {/each}
        {#if rows.length > limit}<button class="more" onclick={() => limit += 50}>Show more tracks</button>{/if}
      </div>
      {#if libraryError}<p role="status">{libraryError} <button onclick={load}>Retry</button></p>{/if}
      {#if notice}<p class="notice" role="status">{notice}</p>{/if}
    </div>
  {/if}
  {#if error && musicWindow.mode !== 'closed'}<p class="error" role="status">{error}</p>{/if}
</aside>

<style>
  aside{position:fixed;z-index:12;inset:calc(var(--mast-height) + .6rem) var(--gutter) auto auto;width:min(26rem,calc(100vw - 1.5rem));max-height:calc(100dvh - var(--mast-height) - 1.5rem);display:flex;flex-direction:column;overflow:auto;overscroll-behavior:contain;border:1px solid #71806b;border-radius:9px;background:var(--paper);color:var(--ink);box-shadow:0 12px 48px #0c231e45;font:400 .91rem/1.3 var(--font-ui);color-scheme:light}
  aside[hidden]{display:none}
  aside:focus-visible{outline:2px solid var(--river);outline-offset:2px}
  aside :focus-visible{outline:2px solid #b17739;outline-offset:-2px}
  button{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;min-height:40px;min-width:40px;padding:0;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
  button:hover{background:#58705612}
  button:disabled{opacity:.5;cursor:default}
  .cover{position:relative;flex:none;min-height:8.3rem;display:flex;align-items:end;color:#fff6dd;background:linear-gradient(0deg,#132c26fa,#172b256b 63%,transparent),url('/city/valley-print.webp') center 52% / cover}
  .cover.local{background:linear-gradient(0deg,#172d29e8,#24352d55),url('/city/valley-flight.webp') center / cover}
  .cover-tools{position:absolute;top:.25rem;right:.3rem;display:flex;color:#fff9e8}
  .cover-tools button{background:#192e286e;border-radius:50%;min-width:36px;min-height:36px}
  .caption{padding:2.75rem 1.15rem .95rem;min-width:0}
  small{display:block;font:500 .76rem/1.3 var(--font-ui);letter-spacing:.025em}
  h2{margin:.15rem 0 0;font:400 clamp(1.65rem,4vw,2.05rem)/1.08 var(--font-reading);letter-spacing:-.035em;overflow-wrap:anywhere}
  .deck{padding:.55rem 1rem .65rem;background:#eaf0e5;border-bottom:1px solid var(--line)}
  .timeline,.deck-controls,.volume,.transport,header,.views,.filters,.row,.compact{display:flex;align-items:center}
  .timeline{gap:.55rem;font-variant-numeric:tabular-nums;font-size:.72rem;color:var(--muted)}
  input[type="range"]{min-width:0;width:100%;height:24px;accent-color:var(--river);cursor:pointer}
  .timeline label,.timeline span{min-width:2rem}.timeline span:last-child{text-align:right}
  .deck-controls,header{justify-content:space-between;gap:.5rem}
  .transport{gap:2px}.transport button,.volume button{border-radius:50%;position:relative}
  .play{background:var(--ink);color:#fcf7e7;border-radius:50%;min-height:42px;min-width:42px}.play:hover{background:var(--river)}
  button.enabled{color:#1e5c43;background:#ccdcca}
  sup{position:absolute;right:5px;bottom:4px;font-size:.67rem}
  .volume{width:min(32%,8rem);gap:2px}.volume button{min-width:34px}.level{min-width:2.4em;text-align:right;font-size:.7rem;font-variant-numeric:tabular-nums}
  .collection{min-height:0;display:flex;flex-direction:column;padding:0 .85rem .45rem}
  header{flex:none;margin:.35rem 0}.views{gap:.75rem}
  .views button{border-bottom:2px solid transparent;color:var(--muted);font-size:.9rem}
  .views [aria-pressed="true"]{border-color:var(--river);font-weight:650;color:var(--ink)}
  .views span{margin-left:.25rem;font-size:.72rem;font-variant-numeric:tabular-nums}
  .add{gap:.2rem;color:var(--river);font-size:.83rem;font-weight:600}
  .import-options{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;padding:.35rem .5rem;margin-bottom:.4rem;background:var(--field);border-radius:4px}
  .import-options small{flex:1}.import-options button{padding:0 .4rem;color:var(--river);font-size:.8rem;text-decoration:underline}
  .filters{gap:.4rem;flex:none;margin:0 0 .35rem}
  .filters label{display:grid;gap:.2rem;flex:1;min-width:0;color:var(--muted);font-size:.75rem}
  .filters .search-field{flex:1.25}
  .filters input,.filters select{min-width:0;width:100%;height:37px;padding:0 .45rem;background:#fffefa;border:1px solid var(--line);border-radius:4px;color:var(--ink);font:400 .85rem var(--font-ui)}
  .list{min-height:3rem;max-height:21.5rem;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}
  .row{border-bottom:1px solid #dfe4d9;min-height:42px}.row:last-child{border:0}
  .row.active{background:#e7eee1}
  .song{flex:1;min-width:0;justify-content:start;gap:.5rem;text-align:left}
  .number,.length{font-size:.72rem;color:var(--muted);font-variant-numeric:tabular-nums}
  .number{width:1.8rem;flex:none;text-align:center}.number :global(svg){vertical-align:middle;width:15px}
  .song-title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .row>button:not(.song){min-width:34px;color:var(--muted)}
  .more,.empty{width:100%;text-align:center}.empty,.notice,.error{padding:.55rem;font-size:.82rem}
  .notice{color:var(--muted)}.error{color:#783e2d}
  .compact{gap:.1rem;padding:.4rem .5rem;background:#edf1e6;border-left:4px solid var(--river)}
  .compact-title{min-width:0;flex:1;display:block;padding:0 .45rem;text-align:left}
  .compact-title strong,.compact-title small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .compact-title strong{display:block;font:500 1.08rem/1.25 var(--font-reading)}
  .compact-title small{color:var(--muted);font-size:.7rem}
  @media(prefers-reduced-motion:no-preference){
    button{transition:background-color 140ms,color 140ms}
    .transport button:active,.cover-tools button:active{transform:translateY(1px)}
  }
  @media(max-width:600px){
    aside{inset:auto .55rem max(.55rem,env(safe-area-inset-bottom)) auto;width:calc(100vw - 1.1rem);max-height:calc(100dvh - 1.3rem)}
    :global(body:has(#soundtrack.mini)){padding-bottom:calc(4.4rem + env(safe-area-inset-bottom))}
    .list{max-height:min(26dvh,13rem)}.cover{min-height:6.8rem}
    button,button.play,.row>button:not(.song),.volume button,.cover-tools button{min-height:44px;min-width:44px}
    .filters select,.filters input,input[type="range"]{height:44px}
    .transport{gap:0}.volume{flex:1}.deck-controls{gap:.2rem}
  }
  @media(max-height:520px){.cover{min-height:4rem}.caption{padding:.6rem 5rem .6rem .9rem}.list{min-height:2.8rem}.collection{overflow:auto}.cover h2{font-size:1.35rem}}
  @media(max-width:380px){
    .deck-controls{display:grid;grid-template-columns:minmax(0,1fr);gap:0}
    .deck-controls .transport{justify-content:space-between}
    .volume{width:100%}.volume input{flex:1}
  }
</style>
