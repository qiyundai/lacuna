export interface Palette {
  base: string;
  glows: [string, string, string];
  text: string;
  textFaint: string;
}

export type WeatherStatus = 'loading' | 'ready' | 'fallback';

const WARM_TEXT = 'rgba(255, 238, 220, 0.88)';
const WARM_TEXT_FAINT = 'rgba(255, 238, 220, 0.18)';
const COOL_TEXT = 'rgba(230, 236, 248, 0.88)';
const COOL_TEXT_FAINT = 'rgba(230, 236, 248, 0.18)';

const PALETTES = {
  clearDay: {
    base: '#141008',
    glows: ['#e8a85c', '#f2c878', '#d08862'],
    text: WARM_TEXT,
    textFaint: WARM_TEXT_FAINT,
  },
  clearNight: {
    base: '#0c0d18',
    glows: ['#4a4a82', '#c8a05a', '#5a3a5a'],
    text: COOL_TEXT,
    textFaint: COOL_TEXT_FAINT,
  },
  cloudy: {
    base: '#151210',
    glows: ['#c07870', '#a89080', '#d8a088'],
    text: WARM_TEXT,
    textFaint: WARM_TEXT_FAINT,
  },
  rain: {
    base: '#0e1218',
    glows: ['#5a7090', '#c89060', '#403860'],
    text: COOL_TEXT,
    textFaint: COOL_TEXT_FAINT,
  },
  snow: {
    base: '#14141a',
    glows: ['#d8d0e0', '#e0c898', '#a8b8d0'],
    text: COOL_TEXT,
    textFaint: COOL_TEXT_FAINT,
  },
  fog: {
    base: '#141212',
    glows: ['#988878', '#b89088', '#705858'],
    text: WARM_TEXT,
    textFaint: WARM_TEXT_FAINT,
  },
  thunderstorm: {
    base: '#0c0a12',
    glows: ['#6a4a78', '#a06048', '#2a3858'],
    text: COOL_TEXT,
    textFaint: COOL_TEXT_FAINT,
  },
} satisfies Record<string, Palette>;

const DEFAULT_PALETTE: Palette = PALETTES.cloudy;

export const weather = $state<{
  palette: Palette;
  status: WeatherStatus;
}>({
  palette: DEFAULT_PALETTE,
  status: 'loading',
});

const CACHE_KEY = 'lacuna_weather';
const CACHE_TTL_MS = 30 * 60 * 1000;

interface CachedWeather {
  code: number;
  isDay: number;
  fetchedAt: number;
}

function paletteFor(code: number, isDay: number): Palette {
  // WMO codes per Open-Meteo docs
  // 0: clear; 1-3: mainly clear / partly cloudy / overcast
  // 45, 48: fog; 51-57: drizzle; 61-67: rain; 71-77: snow; 80-82: rain showers; 85-86: snow showers; 95-99: thunderstorm
  if (code === 0) return isDay ? PALETTES.clearDay : PALETTES.clearNight;
  if (code === 1) return isDay ? PALETTES.clearDay : PALETTES.clearNight;
  if (code === 2 || code === 3) return PALETTES.cloudy;
  if (code === 45 || code === 48) return PALETTES.fog;
  if (code >= 51 && code <= 67) return PALETTES.rain;
  if (code >= 80 && code <= 82) return PALETTES.rain;
  if (code >= 71 && code <= 77) return PALETTES.snow;
  if (code === 85 || code === 86) return PALETTES.snow;
  if (code >= 95 && code <= 99) return PALETTES.thunderstorm;
  return DEFAULT_PALETTE;
}

function readCache(): CachedWeather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWeather;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(code: number, isDay: number): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ code, isDay, fetchedAt: Date.now() } satisfies CachedWeather),
    );
  } catch {
    // localStorage can fail in private modes; palette simply won't cache.
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('no geolocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 5000,
      maximumAge: 30 * 60 * 1000,
      enableHighAccuracy: false,
    });
  });
}

async function fetchWeather(lat: number, lon: number): Promise<{ code: number; isDay: number }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=weather_code,is_day`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather fetch ${res.status}`);
  const data = (await res.json()) as { current?: { weather_code?: number; is_day?: number } };
  const code = data.current?.weather_code;
  const isDay = data.current?.is_day;
  if (typeof code !== 'number' || typeof isDay !== 'number') throw new Error('bad weather payload');
  return { code, isDay };
}

export async function initWeather(): Promise<void> {
  const cached = readCache();
  if (cached) {
    weather.palette = paletteFor(cached.code, cached.isDay);
    weather.status = 'ready';
    return;
  }

  try {
    const pos = await getPosition();
    const { code, isDay } = await fetchWeather(pos.coords.latitude, pos.coords.longitude);
    writeCache(code, isDay);
    weather.palette = paletteFor(code, isDay);
    weather.status = 'ready';
  } catch {
    weather.palette = DEFAULT_PALETTE;
    weather.status = 'fallback';
  }
}
