export type Track = {
  id: string;
  title: string;
  album: string;
  seconds?: number;
  url?: string;
};

export const deviceAlbum = 'On this device';

async function readAlbum(path: string): Promise<Track[]> {
  const address = new URL(path, new URL('/music/', location.href));
  if (address.origin !== location.origin) throw new Error('Expected a local playlist');
  const response = await fetch(address);
  if (!response.ok) throw new Error('Album unavailable');
  return parseAlbum(await response.text(), address);
}

export function parseAlbum(playlist: string, address: URL): Track[] {
  const lines = playlist.trim().split(/\r?\n/).map(line => line.trim());
  if (lines[0] !== '#EXTM3U') throw new Error('Invalid album playlist');
  const album = lines.find(line => line.startsWith('#PLAYLIST:'))?.slice(10).trim() || address.pathname;
  const tracks: Track[] = [];
  const occurrences = new Map<string, number>();
  let title = '', seconds = 0;
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const comma = line.indexOf(',');
      seconds = Number(line.slice(8, comma));
      title = line.slice(comma + 1).trim();
    } else if (line && !line.startsWith('#')) {
      const url = new URL(line, address);
      if (url.origin !== address.origin) throw new Error('Expected local music');
      const source = url.pathname + url.search;
      const count = (occurrences.get(source) ?? 0) + 1;
      occurrences.set(source, count);
      const id = address.pathname + '#' + source + (count > 1 ? '#' + count : '');
      tracks.push({ id, title: title || line, album, seconds: seconds > 0 && Number.isFinite(seconds) ? seconds : undefined, url: source + url.hash });
      title = '';
      seconds = 0;
    }
  }
  return tracks;
}

export async function loadAlbums() {
  const response = await fetch('/music/library.json');
  if (!response.ok) throw new Error('Music library unavailable');
  const paths: string[] = await response.json();
  const results = await Promise.allSettled(paths.map(readAlbum));
  return {
    tracks: results.flatMap(result => result.status === 'fulfilled' ? result.value : []),
    missing: paths.filter((_, index) => results[index].status === 'rejected')
  };
}

async function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lacuna-device-music', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('tracks', { keyPath: 'id' });
      request.result.createObjectStore('audio');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readMusic<T>(store: string, key?: string): Promise<T> {
  const db = await openLibrary();
  try {
    return await new Promise<T>((resolve, reject) => {
      const records = db.transaction(store).objectStore(store);
      const request = key === undefined ? records.getAll() : records.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function deviceTracks() {
  const tracks = await readMusic<Track[]>('tracks');
  const order = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return tracks.sort((a, b) => order.compare(a.album, b.album) || order.compare(a.title, b.title));
}
export const readAudio = (id: string) => readMusic<Blob | undefined>('audio', id);

async function changeMusic(change: (tx: IDBTransaction) => void) {
  const db = await openLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['tracks', 'audio'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      try { change(tx); } catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}

export async function importMusic(files: File[]) {
  await changeMusic(tx => {
    for (const file of files) {
      const id = JSON.stringify([file.webkitRelativePath || file.name, file.size, file.lastModified]);
      const folder = file.webkitRelativePath?.split('/').at(-2);
      const track: Track = { id, title: file.name.replace(/\.[^.]+$/, ''), album: folder || deviceAlbum };
      tx.objectStore('tracks').put(track);
      tx.objectStore('audio').put(file, id);
    }
  });
}

export function removeMusic(id: string) {
  return changeMusic(tx => {
    tx.objectStore('tracks').delete(id);
    tx.objectStore('audio').delete(id);
  });
}
