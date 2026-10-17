// Ambient color follows this device's clock. No location, external service, or cache.
export interface Palette { base: string; glows: [string, string, string]; text: string; textFaint: string }
export const weather = $state<{ palette: Palette; status: 'loading' | 'ready' | 'fallback' }>({ palette: { base: '#151210', glows: ['#c07870', '#a89080', '#d8a088'], text: 'rgba(255,238,220,.88)', textFaint: 'rgba(255,238,220,.5)' }, status: 'loading' });
export function initWeather(): void {
  const hour = new Date().getHours();
  if (hour < 7 || hour >= 19) weather.palette = { base: '#0c0d18', glows: ['#4a4a82', '#c8a05a', '#5a3a5a'], text: 'rgba(230,236,248,.88)', textFaint: 'rgba(230,236,248,.5)' };
  weather.status = 'ready';
}
