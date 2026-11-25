export const lenses = {
  story_thread: 'Through-line',
  voices: 'Competing wishes',
  blind_spots: 'Looking back',
  unsaid: 'Left unsaid',
  story_loop: 'A familiar story',
  where_you_are: 'Transitions'
} as const;
export type Lens = keyof typeof lenses;
export type Page = { id: string; created_at: number; body: string; writingDay?:number };
export type Note = { topic: string; quote: string };
export type Evidence = Page & { notes: Note[] };
export type Reading = { lens: Lens; text: string; support: string[] };
export type Passage = { id: string; edition: number; written: number; sources: string[]; pages: string[]; title: string; prose: string; readings: Reading[] };
export type Chapter = { id: string; pages: string[]; passages: Passage[]; repairs?: string[][]; closed?: true };
export type Book = { version: 1; notes: Record<string, Note[]>; chapters: Chapter[]; lastEdition?:number };
export type BookTask = { kind: 'observe'|'write'; primary: string[]; evidence: Evidence[]; chapter?: string };
export const emptyBook = (): Book => ({ version: 1, notes: {}, chapters: [] });
export const writingDay = (page: Pick<Page,'created_at'|'writingDay'>) => page.writingDay??Math.floor(page.created_at / 86400);
const day=writingDay;
export function localWritingDay(date:Date){
  return Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000;
}
const days = (pages: Page[]) => new Set(pages.map(day)).size;
const overlaps = (left: Set<string>, right: Set<string>) => [...left].some(item => right.has(item));
const topics = (book: Book, ids: string[]) => new Set(ids.flatMap(id => (book.notes[id] ?? []).map(n => n.topic.toLowerCase())));
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bounded = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

export function forgetFromBook(book: Book, id: string) {
  delete book.notes[id];
  for (const chapter of book.chapters) {
    const repairs=[...(chapter.repairs??[]),...chapter.passages.filter(p=>p.sources.includes(id)).map(p=>p.pages)];
    chapter.repairs=repairs.map(group=>group.filter(page=>page!==id)).filter(group=>group.length);
    chapter.pages = chapter.pages.filter(page => page !== id);
    chapter.passages = chapter.passages.filter(p => !p.sources.includes(id));
  }
  book.chapters = book.chapters.filter(c => c.pages.length);
  if(!book.chapters.length)delete book.lastEdition;
}

function placePage(book: Book, page: Page, byId: Map<string, Page>) {
  let chapter = book.chapters.at(-1);
  if(chapter?.closed)chapter=undefined;
  if (chapter) {
    const prior = chapter.pages.map(id => byId.get(id)!);
    const last = prior.at(-1)!;
    let split = prior.length;
    let close = prior.length >= 8 && days(prior) >= 4 && day(page) - day(last) >= 21;
    const published = new Set(chapter.passages.flatMap(p => p.pages));
    const next = [...prior, page];
    if (!close && next.length >= 11) {
      let best = 0;
      for (let i = 8; i < next.length; i++) {
        const tail = next.slice(i), head = next.slice(0, i);
        if (tail.some(p => published.has(p.id)) || days(head) < 4) continue;
        const before = topics(book, head.slice(-8).map(p => p.id));
        const after = topics(book, tail.map(p => p.id));
        const sustained = [...after].some(topic => !before.has(topic) && days(tail.filter(p => topics(book,[p.id]).has(topic))) >= 3);
        const gap = day(tail[0]!) - day(head.at(-1)!);
        const score = (sustained ? 100 : 0) + Math.min(21,gap);
        if ((sustained || next.length > 30) && score > best) { best = score; split = i; close = true; }
      }
    }
    if (close || prior.length >= 30) {
      const carry = chapter.pages.splice(split);
      chapter.closed=true;
      chapter = { id: crypto.randomUUID(), pages: carry, passages: [] };
      book.chapters.push(chapter);
    }
  }
  if (!chapter) { chapter = { id: crypto.randomUUID(), pages: [], passages: [] }; book.chapters.push(chapter); }
  chapter.pages.push(page.id);
}

export function nextBookTask(book: Book, entries: Page[]): BookTask | undefined {
  const pages = [...entries].sort((a,b) => a.created_at - b.created_at);
  const byId = new Map(pages.map(p => [p.id,p]));
  const evidence = (ids: string[]) => ids.map(id => {
    const page = byId.get(id)!;
    return {id, created_at:page.created_at, writingDay:day(page), body:page.body, notes: book.notes[id] ?? []};
  });
  for (const chapter of book.chapters) {
    const repair=chapter.repairs?.[0];
    if(repair)return {kind:'write',chapter:chapter.id,primary:repair,evidence:evidence(repair)};
    const covered = new Set(chapter.passages.flatMap(p => p.pages));
    const pending = chapter.pages.filter(id => !covered.has(id) && book.notes[id]?.length);
    const primary = pending.slice(0,5);
    if (!primary.length) continue;
    const open = !chapter.closed;
    if (!chapter.passages.length && (primary.length < 3 || days(evidence(primary)) < 2)) {
      if (pending.length < 3 || days(evidence(pending)) < 2) continue;
      primary[primary.length-1] = pending.find(id => day(byId.get(id)!) !== day(byId.get(primary[0]!)!))!;
    }
    if (open && chapter.passages.length && primary.length < 3) continue;
    const focus = topics(book,primary);
    const earlier = pages.filter(p => p.created_at < byId.get(primary[0]!)!.created_at && !primary.includes(p.id) && overlaps(focus,topics(book,[p.id])));
    const callback = earlier.at(-1);
    return {kind:'write', chapter:chapter.id, primary, evidence:evidence(callback ? [callback.id,...primary] : primary)};
  }
  const page = pages.find(p => !Object.hasOwn(book.notes,p.id));
  if (page) return {kind:'observe', primary:[page.id], evidence:evidence([page.id])};
  return undefined;
}

export function acceptBookResult(book: Book, entries: Page[], task: BookTask, result: unknown) {
  if (!record(result)) throw new Error('Invalid reflection');
  const byId = new Map(entries.map(p => [p.id,p]));
  if (!task.evidence.every(p => byId.get(p.id)?.body === p.body)) throw new Error('The journal changed');
  if (task.kind === 'observe') {
    const page = task.evidence[0]!;
    if (Object.hasOwn(book.notes,page.id)) throw new Error('Page already observed');
    if (!Array.isArray(result.notes) || result.notes.length > 4) throw new Error('Invalid observations');
    book.notes[page.id] = result.notes.map(n => {
      if (!record(n) || !bounded(n.topic,64) || !n.topic.trim() || !bounded(n.quote,500) || !n.quote.trim() || !page.body.includes(n.quote)) throw new Error('Observation lacks an exact source');
      return {topic:n.topic.trim(), quote:n.quote};
    });
    placePage(book,page,byId);
    return;
  }
  const chapter = book.chapters.find(c => c.id === task.chapter);
  if (!chapter || !task.primary.every(id => chapter.pages.includes(id)) || chapter.passages.some(p => p.pages.some(id => task.primary.includes(id)))) throw new Error('Passage already changed');
  if (!bounded(result.prose,2200) || !bounded(result.title,90) || !Array.isArray(result.readings) || result.readings.length > 3) throw new Error('Invalid passage');
  const readings = result.readings.map(r => {
    if (!record(r) || typeof r.lens !== 'string' || !Object.hasOwn(lenses,r.lens) || !bounded(r.text,320) || !r.text.trim() ||
        !Array.isArray(r.support) || !r.support.every(id => typeof id === 'string' && task.evidence.some(p => p.id === id)) ||
        days(task.evidence.filter(p => (r.support as string[]).includes(p.id))) < 2) throw new Error('Reading lacks dated evidence');
    return { lens:r.lens as Lens, text:r.text, support:[...new Set(r.support as string[])] };
  });
  for (const value of [result.title,result.prose,...readings.map(r=>r.text)]) {
    for (const match of value.matchAll(/["“]([^"”]+)["”]/g)) {
      if (!task.evidence.some(p => p.body.includes(match[1]!))) throw new Error('Quotation differs from its source');
    }
  }
  const edition=(book.lastEdition??0)+1;
  book.lastEdition=edition;
  chapter.passages.push({id:crypto.randomUUID(),edition,written:Math.floor(Date.now()/1000),sources:task.evidence.map(p=>p.id),pages:[...task.primary],title:chapter.passages.length?'':result.title.trim(),prose:result.prose.trim(),readings});
  chapter.passages.sort((a,b)=>chapter.pages.indexOf(a.pages[0]!)-chapter.pages.indexOf(b.pages[0]!));
  if(chapter.repairs?.[0]?.every(id=>task.primary.includes(id)))chapter.repairs.shift();
}

export function validBook(value: unknown, pages: Page[]): value is Book {
  if (!record(value) || value.version !== 1 || !record(value.notes) || !Array.isArray(value.chapters) ||
      (value.lastEdition!==undefined && (!Number.isSafeInteger(value.lastEdition) || Number(value.lastEdition)<0))) return false;
  const byId = new Map(pages.map(p=>[p.id,p]));
  const notes = value.notes;
  const used = new Set<string>();
  return Object.entries(notes).every(([id,list]) => byId.has(id) && Array.isArray(list) && list.length <= 4 &&
    list.every(n => record(n) && bounded(n.topic,64) && bounded(n.quote,500) && n.quote && byId.get(id)!.body.includes(n.quote))) &&
    value.chapters.every(c => record(c) && typeof c.id === 'string' && Array.isArray(c.pages) && c.pages.length &&
      c.pages.every(id => typeof id === 'string' && Object.hasOwn(notes,id) && !used.has(id) && used.add(id)) &&
      (c.repairs===undefined || Array.isArray(c.repairs) && c.repairs.every(group=>Array.isArray(group) && group.length>0 && group.every(id=>(c.pages as string[]).includes(id)))) &&
      Array.isArray(c.passages) && c.passages.every(p => record(p) && typeof p.id === 'string' && Number.isSafeInteger(p.edition) && Number(p.edition)>0 && Number(p.edition)<=Number(value.lastEdition??0) && Number.isSafeInteger(p.written) && bounded(p.title,90) && bounded(p.prose,2200) &&
        Array.isArray(p.sources) && p.sources.length && p.sources.every(id=>Object.hasOwn(notes,id)) && Array.isArray(p.pages) &&
        p.pages.length && p.pages.every(id=>(c.pages as string[]).includes(id) && (p.sources as string[]).includes(id)) &&
        Array.isArray(p.readings) && p.readings.every(r=>record(r) && typeof r.lens==='string' && Object.hasOwn(lenses,r.lens) && bounded(r.text,320) &&
          Array.isArray(r.support) && r.support.every(id=>(p.sources as string[]).includes(id)) && days(r.support.map(id=>byId.get(id)!))>=2)));
}
