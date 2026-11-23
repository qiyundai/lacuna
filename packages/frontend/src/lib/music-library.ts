export type Track = {
  id: string;
  title: string;
  album: string;
  seconds?: number;
  url: string;
};

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

// Earlier releases let people import their own audio into this IndexedDB database. That feature is
// gone (any music player on the device does it better), so clear what it may have left behind.
export function forgetDeviceMusic() {
  try { indexedDB.deleteDatabase('lacuna-device-music'); } catch { /* storage unavailable: nothing to clear */ }
}
