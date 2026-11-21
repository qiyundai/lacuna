import { build } from 'esbuild';
import { randomInt } from 'node:crypto';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
const compiled=await build({stdin:{contents:`export * from './packages/shared/living-book.ts';export * from './packages/worker/src/ai/book-prompts.ts';export * from './packages/worker/src/ai/pipeline.ts';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {emptyBook,nextBookTask,acceptBookResult,reflectionInstructions,analyzeSnapshot}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const garden=['The beans have two leaves.','I moved the tray to the lower shelf.','I watered the same row again.','The string around the pots came loose.','I picked one bean and left the rest.'];
const walks=['Dad and I took the long way home.','At the crossing Dad stopped to tie a lace.','I was sure he liked this walk for the view.','Today he said he walks this way for the quiet.','I wanted to ask more and also wanted to stay quiet.'];
const letters=['I folded the letter twice.','I wrote the greeting and left the rest blank.','I used to think I always left letters unfinished.','I sent the blue envelope today.','I never wrote about the letter because I was waiting for an answer.'];
function journal(count,body,day){
  return Array.from({length:count},(_,i)=>({id:(i+1).toString(16).padStart(32,'0'),created_at:1609459200+86400*day(i),body:body(i)}));
}
const cases={
  sparse:journal(3,i=>garden[i],i=>i*15),
  burst:journal(20,i=>garden[i%5],()=>0),
  routine:journal(25,i=>garden[i%5],i=>i),
  revision:journal(25,i=>walks[Math.min(4,Math.floor(i/5))],i=>i),
  silence:journal(25,i=>i<12?garden[i%5]:letters[i%5],i=>i+(i>=12?96:0)),
  years:journal(45,i=>[garden,walks,letters][Math.floor(i/15)][i%5],i=>i+Math.floor(i/15)*365)
};
const instructions='Read the synthetic source pages first. Score A and B independently from 1–5 for fidelity, specificity, restraint, period boundaries and rereadability. List fabricated quotations, unsupported biography, and disclosure of forgotten material separately. Any instance fails release. Reveal the key only after recording your scores.';
if(!process.argv.includes('--live')){
  console.log(JSON.stringify({cases:Object.fromEntries(Object.entries(cases).map(([k,v])=>[k,v.length])),instructions},null,2));
}else{
  const env=process.env;
  const model=env.OPENAI_MODEL,cap=Number(env.EVAL_BUDGET_USD),inputRate=Number(env.MODEL_INPUT_MICROS_PER_TOKEN),outputRate=Number(env.MODEL_OUTPUT_MICROS_PER_TOKEN);
  if(!env.OPENAI_API_KEY || !model || ![cap,inputRate,outputRate].every(n=>Number.isFinite(n)&&n>0))throw new Error('Set the model, API key, token rates and evaluation budget first.');
  await mkdir('.test-output',{recursive:true});
  const dir=await mkdtemp(resolve('.test-output','memoir-review-')),costs=[],key={};let spent=0;
  async function ask(system,user,max,json){
    const reserve=(Buffer.byteLength(system+user)+256)*inputRate+max*outputRate;
    if(spent+reserve>cap*1e6)throw new Error('Evaluation budget reached.');
    const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions:system,input:user,max_output_tokens:max,...(json?{text:{format:{type:'json_object'}}}:{})})});
    if(!res.ok)throw new Error('Provider returned '+res.status);
    const data=await res.json();
    spent+=data.usage.input_tokens*inputRate+data.usage.output_tokens*outputRate;
    if(data.status!=='completed')throw new Error('Incomplete evaluation response');
    return data.output.flatMap(o=>o.content??[]).find(c=>c.type==='output_text').text;
  }
  for(const [name,entries] of Object.entries(cases)){
    const start=spent,book=emptyBook();let task;
    while((task=nextBookTask(book,entries))){
      const user=JSON.stringify({primary:task.primary,pages:task.evidence});
      const response=await ask(reflectionInstructions(task.kind),user,task.kind==='observe'?500:1400,true);
      acceptBookResult(book,entries,task,JSON.parse(response));
    }
    const newCost=spent-start;
    let snapshot={entries,version:0,weights:{},graph:{nodes:[],processed_count:0},extracted:0,summaries:[],memoir:null,memoirCount:0};
    do{
      const r=await analyzeSnapshot(snapshot,async(prompt,_complex,max)=>ask(prompt.system,prompt.user,max,/json/i.test(prompt.user)));
      snapshot={...snapshot,...r,memoir:r.memoir??snapshot.memoir,summaries:[...snapshot.summaries,...r.summaries.map(s=>({from_entry_num:s.from,to_entry_num:s.to,summary_text:s.text}))]};
    }while(snapshot.extracted<entries.length);
    const prior={memoir:snapshot.memoir,analysis:snapshot.weights},next={memoir:book.chapters.map(c=>c.passages.map(p=>p.prose)),analysis:book.chapters.flatMap(c=>c.passages.flatMap(p=>p.readings))};
    const flip=randomInt(2);key[name]=flip?'B':'A';
    costs.push({name,pages:entries.length,newUSD:newCost/1e6,legacyUSD:(spent-start-newCost)/1e6});
    await writeFile(resolve(dir,name+'.json'),JSON.stringify({entries,A:flip?prior:next,B:flip?next:prior},null,2));
    await writeFile(resolve(dir,'reveal-after-review.json'),JSON.stringify({newSystem:key,costs,model},null,2));
  }
  console.log(instructions+'\n'+dir);
}
