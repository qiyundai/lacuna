export type ValleyWeather = Readonly<{
  rain: number;
  snow: number;
  overcast: number;
  runoff: number;
  snowCover: number;
}>;

const presets = {
  clear: { rain: 0, snow: 0, overcast: 0, runoff: 0, snowCover: 0 },
  rain: { rain: .8, snow: 0, overcast: .86, runoff: .76, snowCover: 0 },
  clearing: { rain: 0, snow: 0, overcast: .27, runoff: .23, snowCover: 0 },
  snow: { rain: 0, snow: .75, overcast: .72, runoff: 0, snowCover: .72 }
} satisfies Record<string, ValleyWeather>;

export type WeatherPreview = keyof typeof presets;

export function studioWeather(value: string | null): WeatherPreview | undefined {
  if (value === 'clear' || value === 'rain' || value === 'clearing' || value === 'snow') return value;
}

const hour = 3_600_000;
const period = 3 * hour;

function noise(key: number) {
  let hash = Math.imul(key ^ 0x71c84e, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function ease(value: number, from: number, to: number) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function weatherFront(now: number) {
  const slot = Math.floor(now / period);
  if (noise(slot) >= .44) return presets.clear;

  const progress = now / period - slot;
  const begin = .14 + .14 * noise(slot + 1743);
  const end = begin + .37 + .12 * noise(slot - 948);
  const peak = .48 + .49 * noise(slot + 561);
  const intensity = peak * ease(progress, begin, begin + .10) * (1 - ease(progress, end - .12, end));
  const overcast = peak * ease(progress, begin - .12, begin + .09) * (1 - ease(progress, end - .08, end + .13));
  const month = new Date(slot * period).getUTCMonth();
  const winter = month <= 1 || month >= 10;
  const frozen = winter && noise(slot + 6281) < .38;
  return { rain: frozen ? 0 : intensity, snow: frozen ? intensity : 0, overcast };
}

export function valleyWeatherAt(now: number, preview?: WeatherPreview): ValleyWeather {
  if (preview) return presets[preview];

  const current = weatherFront(now);
  const recent = weatherFront(now - hour / 9);
  const earlier = weatherFront(now - hour / 4);
  const older = weatherFront(now - hour * .65);
  const runoff = .35 * current.rain + .4 * recent.rain + .25 * earlier.rain;
  const snowCover = .28 * current.snow + .17 * recent.snow + .32 * earlier.snow + .23 * older.snow;
  return { ...current, runoff, snowCover: snowCover * (1 - current.rain) };
}
