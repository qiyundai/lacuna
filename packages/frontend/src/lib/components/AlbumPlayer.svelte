<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/modal.js';
  import Icon from './Icon.svelte';
  import { deviceAlbum, deviceTracks, importMusic, loadAlbums, readAudio, removeMusic, type Track } from '$lib/music-library.js';
  import { musicWindow } from '$lib/music-window.svelte.js';
  import { readLocal, writeLocal } from '$lib/storage.js';
  import { readSoundPreferences, valleyPlayback } from '$lib/valley-playback.svelte.js';

  let audio: HTMLAudioElement;
  let picker: HTMLInputElement;
  let folderPicker: HTMLInputElement;
  let importOptions = $state(false);
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
  let searching = $state(false);
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
  let muted = $derived(!valleyPlayback.music);
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
  let valleyStarted = false, startHandled = false, attempting = false;

  function prepareMusic() {
    if (started) return;
    started = true;
    void load().then(startValleyMusic);
  }

  function startValleyMusic() {
    if (!valleyPlayback.active || valleyPlayback.muted || muted || document.hidden || startHandled || attempting) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    prepareMusic();
    if (!audio.paused) { startHandled = true; return; }
    if (!current) return;
    valleyStarted = true;
    attempting = true;
    void play(current, false, true).then(result => {
      if (valleyPlayback.active && result) startHandled = true;
    }).finally(() => { attempting = false; });
  }

  function endValleyMusic() {
    if (valleyStarted) { ++request; audio.pause(); }
    valleyStarted = false; startHandled = false;
  }

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
    if (musicWindow.mode !== 'closed') prepareMusic();
  });

  onMount(() => {
    if (location.hash === '#soundtrack') musicWindow.mode = 'room';
    musicWindow.toggle = toggle;
    musicWindow.next = () => next();
    let prefs;
    try { prefs = JSON.parse(readLocal('lacuna_music_player') ?? '{}'); } catch { prefs = {}; }
    if (typeof prefs?.volume === 'number') volume = Math.min(1, Math.max(0, prefs.volume));
    readSoundPreferences();
    shuffled = prefs?.shuffled === true;
    if (['off', 'one', 'all'].includes(prefs?.repeat)) repeat = prefs.repeat;
    if (typeof prefs?.selected === 'string') selected = prefs.selected;
    if (Array.isArray(prefs?.queue)) queue = prefs.queue.filter((id: unknown) => typeof id === 'string');
    prefsReady = true;
    window.addEventListener('lacuna:valley-audio', startValleyMusic);
    window.addEventListener('lacuna:prepare-music', prepareMusic);
    window.addEventListener('lacuna:valley-exit', endValleyMusic);
    if (valleyPlayback.active) startValleyMusic();
    return () => {
      window.removeEventListener('lacuna:valley-audio', startValleyMusic);
      window.removeEventListener('lacuna:prepare-music', prepareMusic);
      window.removeEventListener('lacuna:valley-exit', endValleyMusic);
      ++request; audio?.pause(); if (objectURL) URL.revokeObjectURL(objectURL);
    };
  });

  $effect(() => {
    if (!prefsReady) return;
    audio.volume = volume;
    audio.muted = muted || (valleyPlayback.active && valleyPlayback.muted);
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

  async function play(track: Track, remember = true, automatic = false) {
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
      return true;
    } catch (cause) {
      if (token === request && !(cause instanceof DOMException && (cause.name === 'AbortError' || (automatic && cause.name === 'NotAllowedError'))))
        error = 'Could not play this track. Try again or choose another.';
    }
  }

  function toggle() {
    if (valleyPlayback.active) startHandled = true;
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

  function close() {
    musicWindow.mode = 'closed';
    if (musicWindow.opener?.isConnected) musicWindow.opener.focus({ preventScroll: true });
  }
  // The now-playing line over the city reads these; it never touches the <audio> itself
  $effect(() => { musicWindow.now = current ? { title: current.title, album: current.album } : null; });
  $effect(() => { musicWindow.playing = playing; });
  const total = $derived(duration || current?.seconds || 0);
  const progress = $derived(total ? Math.min(100, position / total * 100) : 0);
  const repeatLabel = $derived(repeat === 'one' ? 'repeat one' : 'repeat');
</script>

<input hidden type="file" multiple accept="audio/*,.flac,.opus,.m4a" bind:this={picker} onchange={addFiles}/>
<input hidden type="file" multiple webkitdirectory bind:this={folderPicker} onchange={addFiles}/>
<audio bind:this={audio} preload="none" onplay={() => playing = true} onpause={() => playing = false}
  ontimeupdate={() => position = audio.currentTime} ondurationchange={() => duration = Number.isFinite(audio.duration) ? audio.duration : 0}
  onerror={() => { if (sourceId) error = 'Could not play this track. Try again or choose another.'; }}
  onended={() => { playing = false; next(true); }}></audio>

{#if musicWindow.mode === 'room'}
  <!--
    The listening room: a full-screen layer in two halves.
    The stage (scene surface) holds what is playing; the leaf (paper) holds the tracks.
    The painting is the backdrop — touching it, like any overlay backdrop, closes the room.
  -->
  <div id="soundtrack" class="room" role="dialog" aria-modal="true" aria-label="Music" tabindex="-1"
    use:modal={{ dismiss: close }} transition:fade={{ duration: 400, easing: cubicOut }}>
    <!-- Touching the painting is a pointer shortcut; keyboard users have Escape and the close button -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <section class="stage" class:local={current && !current.url} class:still={!playing} aria-label="Now playing"
      onclick={event => { if (event.target === event.currentTarget) close(); }}>
      <div class="now">
        <p class="album">{current?.album ?? 'Music'}</p>
        <h2>{current?.title ?? (loading ? 'Gathering the music…' : 'Choose a track')}</h2>
        <div class="scrub">
          <input id="music-seek" aria-label="Seek" type="range" min="0" max={total || 1} step=".1" value={position}
            style:--progress={progress + '%'} disabled={!duration} aria-valuetext={time(position) + ' of ' + time(total)}
            oninput={event => audio.currentTime = +event.currentTarget.value}/>
          <div class="times" aria-hidden="true"><span>{time(position)}</span><span>{time(total)}</span></div>
        </div>
        <div class="transport">
          <button type="button" class="scene-control" aria-label="Previous track" disabled={!current} onclick={previous}><Icon name="previous"/></button>
          <button type="button" class="scene-control raised play" aria-label={playing ? 'Pause' : 'Play'} disabled={!current} onclick={toggle}><Icon name={playing ? 'pause-solid' : 'play-solid'}/></button>
          <button type="button" class="scene-control" aria-label="Next track" disabled={!current} onclick={() => next()}><Icon name="next"/></button>
        </div>
        <div class="modes">
          <button type="button" class="mode" aria-pressed={shuffled} onclick={() => { shuffled = !shuffled; heard.clear(); }}>shuffle</button>
          <button type="button" class="mode" aria-pressed={repeat !== 'off'} aria-label={'Repeat: ' + repeat}
            onclick={() => repeat = repeat === 'all' ? 'one' : repeat === 'one' ? 'off' : 'all'}>{repeatLabel}</button>
        </div>
        {#if error}<p class="error" role="status">{error}</p>{/if}
      </div>
    </section>

    <!-- Where the menu button was, so the way out is where the way in began -->
    <button type="button" class="scene-control solid close" aria-label="Close music" onclick={close}><Icon name="close"/></button>

    <section class="leaf" aria-label={view === 'queue' ? 'Up next' : 'Tracks'}>
      <header class="leaf-head">
        <div class="quiet-toggles" role="group" aria-label="Music views">
          <button type="button" class="quiet-toggle" aria-pressed={view === 'library'} onclick={() => { view = 'library'; limit = 50; }}>tracks</button>
          <button type="button" class="quiet-toggle" aria-pressed={view === 'queue'} onclick={() => { view = 'queue'; limit = 50; }}>up next{#if queued.length}<span class="count">{queued.length}</span>{/if}</button>
        </div>
        {#if view === 'library'}
          <button type="button" class="quiet-toggle" aria-expanded={searching} onclick={() => { searching = !searching; if (!searching) filter = ''; }}>find a song</button>
        {/if}
      </header>
      {#if view === 'library'}
        {#if albums.length > 1}
          <div class="quiet-toggles albums" role="group" aria-label="Albums">
            <button type="button" class="quiet-toggle" aria-pressed={!album} onclick={() => { album = ''; limit = 50; }}>all albums</button>
            {#each albums as name}
              <button type="button" class="quiet-toggle" aria-pressed={album === name} onclick={() => { album = name; limit = 50; }}>{name}</button>
            {/each}
          </div>
        {/if}
        {#if searching}
          <input class="search" type="search" aria-label="Search music" placeholder="a title, an album…" bind:value={filter}
            oninput={() => limit = 50} transition:fade={{ duration: 200 }}/>
        {/if}
      {/if}

      <ol class="tracks">
        {#each rows.slice(0, limit) as track, i (view + track.id + i)}
          <li class:active={current?.id === track.id}>
            <button type="button" class="song" aria-label={'Play ' + track.title} aria-current={current?.id === track.id ? 'true' : undefined}
              onclick={() => { if (view === 'queue') dequeue(i); void play(track); }}>
              <span class="number">{#if current?.id === track.id}<span class="bars" class:still={!playing} aria-hidden="true"><i></i><i></i><i></i></span>{:else}{String(i + 1).padStart(2, '0')}{/if}</span>
              <span class="song-title">{track.title}</span>
              <span class="length">{track.seconds ? time(track.seconds) : ''}</span>
            </button>
            {#if view === 'queue'}
              <button type="button" class="row-action" aria-label={'Remove ' + track.title + ' from up next'} title="Remove from up next" onclick={() => dequeue(i)}><Icon name="remove"/></button>
            {:else}
              <button type="button" class="row-action" aria-label={'Play ' + track.title + ' next'} title="Play next" onclick={() => { queue.push(track.id); notice = track.title + ' plays next.'; }}><Icon name="queue"/></button>
              {#if !track.url}<button type="button" class="row-action" aria-label={'Remove ' + track.title + ' from this device'} title="Remove from this device" onclick={() => remove(track)}><Icon name="remove"/></button>{/if}
            {/if}
          </li>
        {:else}
          <li class="empty">{loading ? 'Gathering the music…' : view === 'queue' ? 'Choose “play next” beside a track to line it up here.' : 'No songs match.'}</li>
        {/each}
      </ol>
      {#if rows.length > limit}<button type="button" class="quiet-toggle more" onclick={() => limit += 50}>more songs</button>{/if}

      <footer class="leaf-foot">
        {#if libraryError}<p class="note" role="status">{libraryError} <button type="button" class="quiet-toggle" onclick={load}>try again</button></p>{/if}
        {#if notice}<p class="note" role="status">{notice}</p>{/if}
        <button type="button" class="quiet-toggle" disabled={importing || loading} aria-expanded={importOptions} onclick={() => importOptions = !importOptions}>{importing ? 'adding…' : 'add your own music'}</button>
        {#if importOptions}
          <div class="import" transition:fade={{ duration: 200 }}>
            <p class="note">Music you add stays in this browser.</p>
            <div class="atlas-links">
              <button type="button" class="atlas-link" onclick={() => { importOptions = false; picker.click(); }}>Choose files</button>
              <button type="button" class="atlas-link" onclick={() => { importOptions = false; folderPicker.click(); }}>Choose an album folder</button>
            </div>
          </div>
        {/if}
      </footer>
    </section>
  </div>
{/if}

<style>
  .room {
    position: fixed;
    inset: 0;
    z-index: var(--z-room);
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(22rem, 34rem);
    background: var(--scene-shade);
    color-scheme: light;
  }
  .room:focus-visible { outline: 0; }

  /* ── Stage: the painting, the title, the transport ─────────── */
  .stage {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: calc(var(--mast-height) + var(--space-6)) var(--gutter) clamp(var(--space-7), 10vh, var(--space-9));
    color: var(--scene-ink);
    cursor: pointer;
  }
  .stage::before, .stage::after { content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; }
  /* Art, not interface: the valley painting, slowly breathing while music plays */
  .stage::before { background: url('/city/valley-print.webp') center 55% / cover; transform: scale(1.04); }
  .stage.local::before { background-image: url('/city/valley-flight.webp'); }
  .stage::after {
    background:
      linear-gradient(0deg, color-mix(in srgb, var(--scene-shade) 94%, transparent), color-mix(in srgb, var(--scene-shade) 35%, transparent) 62%, color-mix(in srgb, var(--scene-shade) 55%, transparent)),
      linear-gradient(90deg, color-mix(in srgb, var(--scene-shade) 40%, transparent), transparent 70%);
  }
  .close { position: absolute; z-index: 1; top: calc((var(--mast-height) - var(--control)) / 2); right: var(--gutter); }
  .now { max-width: 34rem; display: grid; justify-items: start; cursor: default; text-shadow: var(--scene-type-shadow); }
  .album { font: 400 var(--ui-xs)/1.4 var(--font); letter-spacing: var(--ls-label); text-transform: uppercase; color: var(--scene-ink-muted); }
  h2 { margin-top: var(--space-2); font: 400 var(--display-1)/var(--lh-display) var(--font); letter-spacing: var(--ls-display); text-wrap: balance; overflow-wrap: anywhere; }

  /* A single hairline to move through the song */
  .scrub { width: 100%; margin-top: var(--space-6); }
  .scrub input {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    width: 100%;
    height: 24px;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }
  .scrub input::-webkit-slider-runnable-track {
    height: 1px;
    background: linear-gradient(90deg, var(--scene-ink) var(--progress), color-mix(in srgb, var(--scene-ink) 28%, transparent) var(--progress));
  }
  .scrub input::-moz-range-track { height: 1px; background: color-mix(in srgb, var(--scene-ink) 28%, transparent); }
  .scrub input::-moz-range-progress { height: 1px; background: var(--scene-ink); }
  .scrub input::-webkit-slider-thumb { -webkit-appearance: none; width: 11px; height: 11px; margin-top: -5px; border: 0; border-radius: 50%; background: var(--scene-ink); box-shadow: 0 0 0 5px color-mix(in srgb, var(--scene-ink) 14%, transparent); }
  .scrub input::-moz-range-thumb { width: 11px; height: 11px; border: 0; border-radius: 50%; background: var(--scene-ink); box-shadow: 0 0 0 5px color-mix(in srgb, var(--scene-ink) 14%, transparent); }
  .scrub input:disabled { cursor: default; opacity: .55; }
  .scrub input:focus-visible { outline: var(--focus-width) solid var(--scene-focus); outline-offset: var(--focus-offset); }
  .times { display: flex; justify-content: space-between; font: 400 var(--ui-xs)/1.4 var(--font); letter-spacing: var(--ls-ui); font-variant-numeric: tabular-nums; color: var(--scene-ink-muted); }

  .transport { display: flex; align-items: center; gap: var(--space-4); margin-top: var(--space-4); margin-left: calc((var(--icon) - var(--control)) / 2); text-shadow: none; }
  .play { inline-size: 56px; block-size: 56px; --icon-size: 22px; }
  .modes { display: flex; gap: var(--space-5); margin-top: var(--space-3); }
  .mode { min-height: var(--control); padding: 0; border: 0; background: none; color: var(--scene-ink-muted); font: 400 var(--ui-sm)/1.4 var(--font); letter-spacing: var(--ls-ui); text-shadow: var(--scene-type-shadow); cursor: pointer; text-decoration: underline; text-decoration-color: transparent; text-underline-offset: .4em; transition: color var(--dur-micro) var(--ease-soft), text-decoration-color var(--dur-micro) var(--ease-soft); }
  .mode:hover { color: var(--scene-ink); }
  .mode[aria-pressed=true] { color: var(--scene-ink); text-decoration-color: currentColor; }
  .mode:focus-visible { outline-color: var(--scene-focus); }
  .error { margin-top: var(--space-3); font: 400 var(--ui-sm)/var(--lh-ui) var(--font); color: var(--scene-focus); }

  /* ── Leaf: the tracks, on paper ────────────────────────────── */
  .leaf {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--line) transparent;
    padding: calc(var(--mast-height) + var(--space-4)) var(--sheet-inset) var(--space-7);
    background: var(--paper);
    color: var(--ink);
    box-shadow: inset 6px 0 12px -10px var(--scene-shade);
  }
  .leaf-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; column-gap: var(--space-5); padding-bottom: var(--space-1); border-bottom: 1px solid var(--rule); }
  .albums { margin-top: var(--space-2); }
  .search { width: 100%; min-height: 48px; margin-top: var(--space-2); padding: var(--space-2) 0; border: 0; border-bottom: 1px solid var(--line-strong); border-radius: 0; background: none; color: var(--ink); font: 400 var(--text-md)/1.4 var(--font); }
  .search:focus-visible { outline: 0; border-bottom-color: var(--ink); }
  .search::placeholder { color: var(--ink-subtle); font-style: italic; }

  .tracks { list-style: none; margin-top: var(--space-3); }
  .tracks li { display: flex; align-items: center; border-bottom: 1px solid var(--rule); }
  .song { flex: 1; min-width: 0; display: grid; grid-template-columns: 2.25rem minmax(0, 1fr) auto; align-items: baseline; column-gap: var(--space-3); min-height: 52px; padding: var(--space-3) 0; border: 0; background: none; color: var(--ink-muted); font: inherit; text-align: left; cursor: pointer; transition: color var(--dur-micro) var(--ease-soft); }
  .song:hover, .active .song { color: var(--ink); }
  .number, .length { font: 400 var(--ui-xs)/1 var(--font); letter-spacing: var(--ls-ui); font-variant-numeric: tabular-nums; color: var(--ink-subtle); }
  .song-title { font: 400 var(--text-md)/var(--lh-tight) var(--font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-action { flex: none; display: grid; place-items: center; inline-size: var(--control); block-size: var(--control); margin-right: calc((var(--icon-sm) - var(--control)) / 2); padding: 0; border: 0; border-radius: 50%; background: none; color: var(--ink-subtle); --icon-size: var(--icon-sm); cursor: pointer; opacity: .55; transition: opacity var(--dur-micro) var(--ease-soft), color var(--dur-micro) var(--ease-soft); }
  li:hover .row-action, .row-action:focus-visible { opacity: 1; }
  .row-action:hover { color: var(--accent); }
  @media (hover: none) { .row-action { opacity: 1; } }
  .empty { padding: var(--space-5) 0; font: 400 var(--text-sm)/var(--lh-prose) var(--font); color: var(--ink-subtle); }
  .more { margin-top: var(--space-3); }
  .leaf-foot { display: grid; justify-items: start; gap: var(--space-1); margin-top: var(--space-5); }
  .note { font: 400 var(--ui-sm)/var(--lh-ui) var(--font); color: var(--ink-subtle); }
  .import { display: grid; gap: var(--space-1); }

  /* Three small bars that sway while a song sounds and rest when it stops */
  .bars { display: inline-flex; align-items: flex-end; gap: 2px; height: 11px; color: var(--accent); }
  .bars i { width: 2px; height: 100%; border-radius: 1px; background: currentColor; transform-origin: bottom; transform: scaleY(.35); }

  @media (prefers-reduced-motion: no-preference) {
    .stage::before { animation: breathe 48s var(--ease-soft) infinite alternate; }
    .stage.still::before { animation-play-state: paused; }
    .now > * { animation: rise var(--dur-slow) var(--ease-out) backwards; }
    .now > h2 { animation-delay: 60ms; } .now > .scrub { animation-delay: 120ms; } .now > .transport, .now > .modes { animation-delay: 180ms; }
    .bars:not(.still) i { animation: sway 1.1s ease-in-out infinite alternate; }
    .bars i:nth-child(2) { animation-delay: -.45s; } .bars i:nth-child(3) { animation-delay: -.8s; }
    @keyframes breathe { from { transform: scale(1.04); } to { transform: scale(1.12) translate(-1%, -1%); } }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
    @keyframes sway { from { transform: scaleY(.3); } to { transform: scaleY(1); } }
  }

  /* Phones: the stage above, the tracks below */
  @media (max-width: 760px) {
    .room { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .stage { min-height: min(25rem, 52dvh); padding: calc(var(--mast-height) + var(--space-4)) var(--gutter) var(--space-5); }
    h2 { font-size: var(--display-2); }
    .scrub { margin-top: var(--space-4); }
    .transport { margin-top: var(--space-2); }
    .modes { margin-top: 0; }
    .leaf { padding: var(--space-4) var(--gutter) max(var(--space-6), env(safe-area-inset-bottom)); box-shadow: none; }
  }
  @media (max-height: 560px) and (min-width: 761px) { h2 { font-size: var(--display-2); } }
</style>
