/*
 * Shared state between the soundtrack (AlbumPlayer, which owns the <audio>)
 * and the places that show it: the menu's music item and the now-playing
 * line over the city.
 *   mode    — whether the full-screen listening room is open
 *   now     — the current track, or null before the library loads
 *   playing — whether audio is actually sounding
 *   scenes  — how many live scenes are on screen to show through the room
 *   toggle/next — registered by AlbumPlayer; no-ops until it mounts
 */
export const musicWindow = $state({
  mode: 'closed' as 'closed' | 'room',
  opener: null as HTMLElement | null,
  now: null as { title: string; album: string } | null,
  playing: false,
  scenes: 0,
  toggle: () => {},
  next: () => {}
});

export function openListeningRoom(opener: HTMLElement | null) {
  musicWindow.opener = opener;
  musicWindow.mode = 'room';
}
