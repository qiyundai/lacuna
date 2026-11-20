export type Trace = 'noticed' | 'passed' | 'sheltered';
export type Gesture = 'forecast' | 'company' | 'return' | 'quiet';
export interface VillageEntry {
  id: string;
  body: string;
  created_at: number;
  presence?: string;
  previousPresence?: string;
  traces?: Trace[];
  reading?: {gesture:Gesture;quote:string};
}
export interface Presence<E extends VillageEntry = VillageEntry> {
  id: string;
  entries: E[];
}
const common = new Set('about after again also another around back because been before being could didn does down even ever every feel felt first from have here just like little made more much myself really same some something still than that their them then there these they thing think this those time today very want went were what when where which while will with would yesterday your'.split(' '));
const people = /\b(dad|father|mum|mom|mother|sister|brother|grandma|grandpa|wife|husband|partner)\b/gi;
const weather = /\b(forecasts?|weather|rain warnings?|weather reports?)\b/i;
const send = /\b(send|sends|sent|text|texts|texted|warn|warned|tell|tells|told|share|shared|check|checks|checked)\b/i;
const aliases: Record<string,string> = {father:'dad',mother:'mom',mum:'mom'};
function signals(body:string) {
  const family = (body.toLowerCase().match(people) ?? []).map(person=>aliases[person] ?? person);
  const words = new Set((body.toLowerCase().match(/[\p{L}\p{N}’']+/gu) ?? []).filter(w=>w.length>3 && !common.has(w)));
  return {family,words,forecast:weather.test(body) && send.test(body)};
}
function similarity(a:ReturnType<typeof signals>, b:ReturnType<typeof signals>) {
  if (a.family.length && b.family.length && !a.family.some(p=>b.family.includes(p))) return 0;
  const shared = [...a.words].filter(w=>b.words.has(w)).length;
  if (a.forecast && b.forecast) return 4 + shared;
  return shared >= 2 && shared / Math.min(a.words.size,b.words.size) >= .43 ? shared : 0;
}
export function presences<E extends VillageEntry>(entries:E[]): Presence<E>[] {
  const groups = new Map<string,Presence<E>>();
  const last = new Map<string,ReturnType<typeof signals>>();
  const repeats = new Map<string,string>();
  for (const entry of entries) {
    const signal = signals(entry.body);
    const phrase=entry.body.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
    let id = entry.presence ?? (phrase?repeats.get(phrase):undefined);
    if (!id) {
      let best = 0;
      for (const [key,other] of last) {
        const score = similarity(signal,other);
        if (score > best) { best = score; id = key; }
        else if (score && score === best) id = undefined;
      }
    }
    id ??= entry.id;
    const group = groups.get(id) ?? {id,entries:[]};
    group.entries.push(entry);
    groups.set(id,group);
    if(phrase)repeats.set(phrase,id);
    last.set(id,signal);
  }
  return [...groups.values()];
}
export function attachPresence<E extends VillageEntry>(entries:E[], entry:E) {
  const group = presences([...entries,entry]).find(group=>group.entries.at(-1)?.id===entry.id);
  entry.presence = group?.id ?? entry.id;
}
export function gesture(body:string):Gesture {
  if (weather.test(body) && send.test(body)) return 'forecast';
  if (/\b(waited|waits|sat beside|sat with|kept me company|stayed with)\b/i.test(body)) return 'company';
  if (/\b(returned|came home|went back|visited again)\b/i.test(body)) return 'return';
  return 'quiet';
}
export function birdHabit(group:Presence) {
  const entry=group.entries.at(-1)!;
  const kind=entry.reading?.gesture ?? gesture(entry.body);
  const familiar=group.entries.some(e=>e.traces?.includes('sheltered'));
  const reciprocating=kind==='forecast' && group.entries.length>1 && /\bI\s+(?:finally\s+)?(?:sent|texted|warned|told|shared)\b/i.test(entry.body);
  if (entry.traces?.includes('sheltered')) return 'rest' as const;
  if (reciprocating) return familiar ? 'return-to-door' as const : 'wait-for-you' as const;
  if (entry.traces?.includes('passed')) return 'forage' as const;
  if (kind==='forecast') return 'lead' as const;
  if (kind==='return' && familiar) return 'return-to-door' as const;
  return kind==='company' ? 'wait-for-you' as const : 'forage' as const;
}
export function remember<E extends VillageEntry>(entries:E[], value:unknown) {
  const event=value as {entry?:string;action?:Trace}|null;
  const entry=entries.find(e=>e.id===event?.entry);
  if (!entry || !event?.action || !['noticed','passed','sheltered'].includes(event.action)) throw new Error('This encounter is no longer available.');
  entry.traces ??= [];
  if (!entry.traces.includes(event.action)) entry.traces.push(event.action);
  return {entries};
}

export function reviseThread<E extends VillageEntry>(entries:E[],value:unknown){
  const request=value as {entry?:string;separate?:boolean}|null;
  const entry=entries.find(e=>e.id===request?.entry);
  if(!entry || typeof request?.separate!=='boolean')throw new Error('This page is unavailable.');
  if(request.separate && !entry.previousPresence){
    const group=presences(entries).find(p=>p.entries.some(e=>e.id===entry.id));
    if(group && group.id!==entry.id){entry.previousPresence=group.id;entry.presence=entry.id;}
  }else if(!request.separate && entry.previousPresence){
    entry.presence=entry.previousPresence;delete entry.previousPresence;
  }
  return {entries};
}
