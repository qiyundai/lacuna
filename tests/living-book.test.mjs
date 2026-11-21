import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { emptyBook, nextBookTask, acceptBookResult, forgetFromBook, validBook } from '../packages/shared/living-book.ts';
import { processBookUnit } from '../packages/frontend/src/lib/reflection-service.ts';
import { createTestDatabase } from './database.mjs';
import app from '../packages/worker/src/index.ts';
import reflections from '../packages/worker/src/routes/reflections.ts';
import { Hono } from 'hono';

test('published reflection endpoints are coming soon before auth, billing or provider work',async()=>{
  for(const path of ['login','checkout','consent','generate']){
    const response=await app.request('https://lacuna.example/reflections/'+path,{method:'POST'},{FRONTEND_ORIGIN:'https://lacuna.example'});
    assert.equal(response.status,503);assert.equal((await response.json()).code,'COMING_SOON');
  }
});

const page=(n,day,body)=>({id:n.toString(16).padStart(32,'0'),created_at:day*86400,body});
const pages=Array.from({length:12},(_,i)=>page(i+1,i,i<3?'Garden '+i:i<6?'Letters '+i:'Garden '+i));
function result(task){
  const first=task.evidence[0];
  if(task.kind==='observe')return {notes:[{topic:first.body.split(' ')[0],quote:first.body}]};
  return {title:'A few days',prose:'You wrote “'+first.body+'”.',readings:new Set(task.evidence.map(p=>p.created_at)).size>1?[{lens:'story_thread',text:'A detail returns.',support:task.evidence.map(p=>p.id)}]:[]};
}
function finish(book,entries){
  let task,count=0;
  while((task=nextBookTask(book,entries))){
    assert.ok(++count<=entries.length*3);
    acceptBookResult(book,entries,task,result(task));
  }
  return book;
}
test('chapter repairs preserve independent passages and retire later callbacks through every edition',()=>{
  const book=finish(emptyBook(),pages);
  const before=book.chapters.flatMap(c=>c.passages),removed=pages[2].id;
  const callbacks=before.filter(p=>p.sources.includes(removed) && !p.pages.includes(removed));
  assert.ok(callbacks.length);
  const safe=before.filter(p=>!p.sources.includes(removed));
  assert.ok(safe.length);
  forgetFromBook(book,removed);
  assert.deepEqual(book.chapters.flatMap(c=>c.passages),safe);
  assert.ok(!JSON.stringify(book).includes(removed));
  const remaining=pages.filter(p=>p.id!==removed);
  assert.ok(validBook(book,remaining));
  finish(book,remaining);
  assert.ok(safe.every(p=>book.chapters.some(c=>c.passages.some(q=>JSON.stringify(p)===JSON.stringify(q)))));
  for(const p of remaining)forgetFromBook(book,p.id);
  assert.deepEqual(book,emptyBook());
});
test('opening, distinct days, long gaps, chapter size and evidence validation',()=>{
  const burst=pages.map(p=>({...p,created_at:100}));
  assert.equal(finish(emptyBook(),burst).chapters[0].passages.length,0);
  const long=Array.from({length:84},(_,i)=>page(i+1,i+(i>=12?50:0),'garden '+i));
  const book=finish(emptyBook(),long);
  assert.ok(book.chapters.length>=4 && book.chapters.every(c=>c.pages.length<=30));
  assert.equal(book.chapters[1].pages[0],long[12].id);
  assert.ok(validBook(book,long));
  const first=book.chapters[0];
  for(const entry of long.filter(p=>!first.pages.includes(p.id)))forgetFromBook(book,entry.id);
  const afterGap=page(99,600,'garden again');
  finish(book,[...long.slice(0,12),afterGap]);
  assert.equal(book.chapters[1].pages[0],afterGap.id);
  const fresh=emptyBook(),task=nextBookTask(fresh,pages);
  assert.throws(()=>acceptBookResult(fresh,pages,task,{notes:[{topic:'sky',quote:'made up'}]}),/exact source/);
  const short=finish(emptyBook(),pages.slice(0,2));
  const third=nextBookTask(short,pages);
  acceptBookResult(short,pages,third,result(third));
  const write=nextBookTask(short,pages);
  assert.throws(()=>acceptBookResult(short,pages,write,{title:'',prose:'“invented”',readings:[]}),/Quotation/);
  assert.throws(()=>acceptBookResult(short,pages,write,{title:'',prose:'',readings:[{lens:'unsaid',text:'An inference',support:[pages[0].id]}]}),/dated evidence/);
});
test('background work refuses a result after forgetting, locking, or losing entitlement',async()=>{
  for(const change of ['forget','lock','billing']){
    const data={entries:[pages[0]],revision:1,reflectionConsent:{account:'owner',epoch:1}};
    const vault={unlocked:true,sessionGeneration:1,read:()=>structuredClone(data),current:async()=>true,update:()=>assert.fail('stale write')};
    let paid=true;
    const call=async(path,body)=>{
      if(path==='account')return {id:'owner',paid,consent:1};
      if(change==='forget'){data.entries=[];data.revision++;}
      if(change==='lock'){vault.sessionGeneration++;vault.unlocked=false;}
      if(change==='billing')paid=false;
      return {result:result(body)};
    };
    assert.equal(await processBookUnit(vault,new AbortController().signal,call),false);
    assert.equal(data.book,undefined);
  }
});

test('hosted payment, consent and usage gates with signed Stripe events and stateless model requests',async t=>{
  const DB=await createTestDatabase();t.after(()=>DB.sqlite.close());
  const env={DB,FRONTEND_ORIGIN:'https://lacuna.example',JWT_SECRET:'synthetic-test-secret',RESEND_API_KEY:'mail',EMAIL_FROM:'test@example.com',STRIPE_SECRET_KEY:'stripe',STRIPE_PRICE_ID:'price_1',STRIPE_WEBHOOK_SECRET:'hook',OPENAI_API_KEY:'model-key',OPENAI_MODEL:'test-model',MODEL_INPUT_MICROS_PER_TOKEN:'1',MODEL_OUTPUT_MICROS_PER_TOKEN:'2',REFLECTION_ACCOUNT_MICROS:'20000',REFLECTION_GLOBAL_MICROS:'50000'};
  let code,cookie='',modelCalls=0,paid=false;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).includes('resend.com')){code=JSON.parse(options.body).text.match(/[a-f0-9]{12}/)[0];return Response.json({id:'sent'});}
    if(String(url).endsWith('/customers'))return Response.json({id:'cus_test'});
    if(String(url).endsWith('/checkout/sessions'))return Response.json({url:'https://checkout.stripe.com/test'});
    if(String(url).includes('/checkout/sessions?'))return Response.json({data:[]});
    if(String(url).includes('/subscriptions?'))return Response.json({data:paid?[{status:'active',current_period_end:2000000000,items:{data:[{price:{id:'price_1'}}]}}]:[]});
    assert.equal(String(url),'https://api.openai.com/v1/responses');
    const payload=JSON.parse(options.body);assert.equal(payload.store,false);modelCalls++;
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"notes":[]}'}]}],usage:{input_tokens:300,output_tokens:15}});
  });
  const enabled=new Hono().route('/reflections',reflections);
  const send=(path,body,headers={})=>enabled.request('https://lacuna.example/reflections/'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:env.FRONTEND_ORIGIN,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)},env);
  assert.equal((await send('login',{email:'me@example.com'})).status,200);
  const verify=await send('verify',{email:'me@example.com',code});
  cookie=verify.headers.get('set-cookie').split(';')[0];
  const account=await verify.json();
  assert.equal(account.paid,false);
  assert.equal((await send('checkout',{})).status,200);
  const data={...nextBookTask(emptyBook(),pages),account:account.id,consent:1,unit:'a'.repeat(64)};
  assert.equal((await send('generate',data)).status,403);
  const event={type:'customer.subscription.updated',data:{object:{customer:'cus_test'}}};
  const stamp=Math.floor(Date.now()/1000),sig=createHmac('sha256','hook').update(stamp+'.'+JSON.stringify(event)).digest('hex');
  assert.equal((await send('webhook',event)).status,400);
  const hook=()=>send('webhook',event,{'Stripe-Signature':'t='+stamp+',v1='+sig});
  paid=true;
  assert.equal((await hook()).status,200);
  assert.equal((await send('generate',data)).status,403);
  assert.equal((await send('consent',{enabled:true})).status,200);
  assert.equal((await send('generate',data,{Origin:'https://elsewhere.example'})).status,403);
  assert.equal((await send('generate',data)).status,200);
  assert.equal(modelCalls,1);
  assert.equal((await send('generate',data)).status,429);
  const usage=await DB.prepare('SELECT * FROM reflection_usage').first();
  assert.equal(usage.micros,330);assert.ok(!JSON.stringify(usage).includes(pages[0].body));
  env.REFLECTION_ACCOUNT_MICROS='1';
  assert.equal((await send('generate',{...data,unit:'b'.repeat(64)})).status,429);
  paid=false;await hook();assert.equal((await send('generate',data)).status,403);
  assert.equal(modelCalls,1);
  await send('logout',{});
  assert.equal((await send('account')).status,401);
});
