import { presences, type VillageEntry } from '../../../../shared/village.js';

export type Activity = 'garden' | 'market' | 'lane' | 'grove';
export const places: Record<Activity,string> = {
  garden:'The kitchen garden', market:'The market square', lane:'The lantern walk', grove:'The riverside grove'
};
export const changes: Record<Activity,string> = {
  garden:'A growing bed took root.', market:'A market stall opened.', lane:'Another stretch of the path is lit.', grove:'A stand of trees took root.'
};

function activity(body:string):Activity {
  if (/\b(garden|gardening|plant(?:ed|ing|s)?|seed(?:ling)?s?|grew|harvest|watering|flowers?|tomatoes|basil)\b/i.test(body)) return 'garden';
  if (/\b(meals?|tea|dinner|lunch|breakfast|bread|cook(?:ed|ing)?|bak(?:e|ed|ing)|kitchen|coffee|table|friends?|together)\b/i.test(body)) return 'market';
  if (/\b(walk(?:ed|ing|s)?|path|road|trip|travel|visit(?:ed)?|came home|train|called|texted|forecast)\b/i.test(body)) return 'lane';
  return 'grove';
}

function crossingLine(body:string) {
  const turningPoint=/^(?:(?:but|and)\s+)?(?:we (?:finally )?(?:talked again|made peace|started talking again)|i (?:finally )?(?:forgave (?:him|her|them|myself)|set a boundary|asked for help)|(?:this time|for once)[, ]+i (?:listened|let (?:her|him|them) finish))\b/i;
  return body.split(/(?<=[.!?])\s+|\n+/).map(line=>line.trim()).find(line=>turningPoint.test(line) && !line.endsWith('?'));
}

export function districts<E extends VillageEntry>(entries:E[]) {
  const order=new Map(entries.map((entry,index)=>[entry.id,index]));
  const blocks=[];
  for(const thread of presences(entries)){
    const pages=thread.entries.map(entry=>({entry,activity:activity(entry.body),crossing:crossingLine(entry.body)}));
    const crossingIndex=pages.findIndex(p=>p.crossing);
    let start=0;
    while(start<pages.length){
      const farBank=crossingIndex>=0 && start>crossingIndex;
      const end=Math.min(start+4,pages.length,!farBank && crossingIndex>=0?crossingIndex+1:Infinity);
      const section=pages.slice(start,end);
      blocks.push({id:section[0]!.entry.id,thread:thread.id,pages:section,farBank,
        landing:crossingIndex>=start && crossingIndex<end?pages[crossingIndex]:undefined,
        name:places[section[0]!.activity]});
      start=end;
    }
  }
  blocks.sort((a,b)=>order.get(a.id)!-order.get(b.id)!);
  const banks=[0,0];
  return blocks.map(block=>{
    const bank=block.farBank?1:0;
    const index=banks[bank]!;
    banks[bank]=index+1;
    const column=Math.floor((index+2)/3);
    const row=(index+2)%3;
    const side=column%2===1?-1:1;
    const x=column===0?-1:side*(14+Math.floor((column-1)/2)*9);
    const z=block.farBank?[-41,-50,-26][row]!:column===0?-11:[-10,-1,9][row]!;
    return {...block,x,z};
  });
}
export type District = ReturnType<typeof districts>[number];
