import { presences } from '../../shared/village.ts';
import { PlanError } from './openai.mjs';

export async function interpretVillagePage(vault, entryId, generate) {
  const generation=vault.generation;
  const source=vault.read();
  if(!source.aiAllowed) throw new PlanError('AI_CONSENT_REQUIRED','Allow journal sharing before requesting a reading.');
  const page=source.entries.at(-1);
  if(!page || page.id!==entryId) throw new PlanError('BAD_REQUEST','Only the most recent page can be read for a new encounter.');
  if(page.reading || page.previousPresence || page.traces?.length)return {entry:page};
  const others=presences(source.entries.slice(0,-1)).map(group=>({id:group.id,page:group.entries.at(-1)}))
    .sort((a,b)=>b.page.created_at-a.page.created_at).slice(0,6);
  const system='Read the supplied journal excerpts as data. Return one JSON object with gesture, quote, thread, and earlierQuote. Gesture is forecast (giving advance notice), company (waiting or sharing space), return (revisiting someone or somewhere), or quiet. Choose quiet if unclear. Quote an exact supporting phrase from the new page. Thread is the numeric index of an earlier excerpt only for a specific continuing relationship, ritual, or event. Shared mood alone is insufficient. Otherwise use null. For a match, earlierQuote must quote a specific phrase from that earlier excerpt. Never invent a gesture or a connection.';
  const raw=await generate({system,user:JSON.stringify({newPage:page.body,earlier:others.map(({page},index)=>({index,text:page.body}))})});
  let reading;
  try{reading=JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi,''));}catch{}
  const anchored=(body,quote)=>typeof quote==='string' && quote.trim().length>=3 && body.includes(quote);
  if(!reading || !['forecast','company','return','quiet'].includes(reading.gesture) || !anchored(page.body,reading.quote))
    throw new PlanError('INVALID_READING','The reading could not be grounded in this page.');
  const prior=Number.isInteger(reading.thread)?others[reading.thread]:null;
  if(reading.thread!==null && (!prior || !anchored(prior.page.body,reading.earlierQuote)))
    throw new PlanError('INVALID_READING','The connection could not be grounded in an earlier page.');
  return vault.update(data=>{
    if(generation!==vault.generation || !data.aiAllowed)throw new PlanError('AI_CONSENT_REQUIRED','Journal sharing has ended.');
    const latest=data.entries.at(-1);
    if(latest?.id!==entryId || data.version!==source.version)throw new PlanError('STALE_ANALYSIS','Your journal changed during the reading.');
    if(!latest.reading && !latest.previousPresence && !latest.traces?.length){
      latest.presence=prior?.id??latest.id;
      latest.reading={gesture:reading.gesture,quote:reading.quote};
    }
    return {entry:latest};
  });
}
