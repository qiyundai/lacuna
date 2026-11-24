import { termsVersion } from '../packages/shared/terms.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { emptyBook, nextBookTask, acceptBookResult, forgetFromBook, validBook } from '../packages/shared/living-book.ts';
import { processBookUnit } from '../packages/frontend/src/lib/reflection-service.ts';
import { reflectionPayload, sourceReadings } from '../packages/worker/src/ai/book-prompts.ts';
import { createTestDatabase } from './database.mjs';
import { maintainAccounts } from '../packages/worker/src/routes/reflections.ts';
import { hashToken } from '../packages/worker/src/ratelimit.ts';
import { operationsSummary } from '../packages/worker/src/operations.ts';
import app from '../packages/worker/src/index.ts';
import { Hono } from 'hono';
import reflectionRoutes from '../packages/worker/src/routes/reflections.ts';

test('private operations reports fixed aggregates and distinguishes missing maintenance',async t=>{
  const DB=await createTestDatabase();t.after(()=>DB.sqlite.close());
  const time=new Date('2026-11-01T12:00:00Z'),seconds=time.getTime()/1000;
  const env={DB,REFLECTION_GLOBAL_MICROS:'15000000'};
  const empty=await operationsSummary(env,time);
  assert.equal(empty.lastMaintenance,null);
  assert.equal(empty.healthy,false);
  await DB.prepare('INSERT INTO maintenance_status VALUES(1,?,1)').bind(seconds-30).run();
  await DB.prepare('INSERT INTO reflection_accounts(id,email,paid_until) VALUES(?,?,?)').bind('private-id','private@example.invalid',seconds+60).run();
  await DB.prepare('INSERT INTO erased_usage_totals VALUES(?,?)').bind('2026-11',8000).run();
  await DB.prepare('INSERT INTO rate_limits(key,count,window_end) VALUES(?,?,?)').bind('mail-total:'+Math.floor(seconds/86400),4,seconds+43200).run();
  assert.deepEqual(await operationsSummary(env,time),{
    version:1,checkedAt:time.toISOString(),healthy:true,lastMaintenance:seconds-30,
    paidAccounts:1,syncBytes:0,syncLimitBytes:134217728,signInAttempts:4,budgetMicros:8000,budgetLimitMicros:15000000
  });
  assert.equal((await operationsSummary(env,new Date(time.getTime()+3600000))).healthy,false);
  assert.equal((await app.request('https://lacuna.example/summary',{},env)).status,404);
});

test('published reflection endpoints are coming soon before auth, billing or provider work',async()=>{
  for(const path of ['checkout','generate']){
    const request=new Request('https://lacuna.example/reflections/'+path,{method:'POST',body:'private test payload'});
    const response=await app.fetch(request,{FRONTEND_ORIGIN:'https://lacuna.example',REFLECTIONS_ENABLED:'true'});
    assert.equal(request.bodyUsed,false);
    assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
    assert.equal(response.status,503);assert.equal((await response.json()).code,'COMING_SOON');
  }
});

test('free billing sign-in only sends codes and opens sessions for existing accounts',async t=>{
  const DB=await createTestDatabase();
  t.after(()=>DB.sqlite.close());
  const origin='https://lacuna.example', env={DB,FRONTEND_ORIGIN:origin,JWT_SECRET:'fixture',RESEND_API_KEY:'fixture',EMAIL_FROM:'fixture@example.invalid'};
  const originalFetch=globalThis.fetch, messages=[];
  t.after(()=>{globalThis.fetch=originalFetch;});
  globalThis.fetch=async (_url,init)=>{messages.push(JSON.parse(init.body));return Response.json({id:'sent'});};
  const send=(path,body)=>app.request(origin+'/reflections/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-lacuna-device='+'a'.repeat(64)},body:JSON.stringify(body)},env);
  const unknown='unknown@example.invalid', existing='existing@example.invalid';
  assert.deepEqual(await (await send('login',{email:unknown})).json(),{ok:true});
  assert.equal(messages.length,0);
  assert.equal(await DB.prepare('SELECT email FROM reflection_challenges').first(),null);
  const stale='abcdefabcdef';
  await DB.prepare('INSERT INTO reflection_challenges VALUES(?,?,?)').bind(unknown,await hashToken('fixture:'+unknown+':'+stale),Math.floor(Date.now()/1000)+60).run();
  assert.equal((await send('verify',{email:unknown,code:stale})).status,401);
  assert.equal(await DB.prepare('SELECT id FROM reflection_accounts').first(),null);
  await DB.prepare('INSERT INTO reflection_accounts(id,email) VALUES(?,?)').bind('existing',existing).run();
  assert.deepEqual(await (await send('login',{email:existing})).json(),{ok:true});
  assert.equal(messages.length,1);
  assert.equal((await send('verify',{email:existing,code:messages[0].text.match(/[a-f0-9]{12}/)[0]})).status,200);
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
    const data={entries:[pages[0]],revision:1,reflectionConsent:{account:'owner',epoch:1,noticeVersion:'2026-11-24'}};
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

test('Luna requests omit cache breakpoints, tools and stored responses', () => {
  const task=nextBookTask(emptyBook(),pages);
  const payload=reflectionPayload('gpt-6-luna',task);
  assert.equal(payload.store,false);
  assert.deepEqual(payload.prompt_cache_options,{mode:'explicit'});
  assert.equal(typeof payload.input,'string');
  assert.equal(payload.tools,undefined);
  assert.equal(reflectionPayload('gpt-5.4-mini-2026-03-17',task).prompt_cache_options,undefined);
});

test('hosted payment, consent and usage gates with signed Stripe events and stateless model requests',async t=>{
  const DB=await createTestDatabase();t.after(()=>DB.sqlite.close());
  const env={DB,FRONTEND_ORIGIN:'https://lacuna.example',JWT_SECRET:'synthetic-test-secret',RESEND_API_KEY:'mail',EMAIL_FROM:'test@example.com',STRIPE_SECRET_KEY:'stripe',STRIPE_PRICE_ID:'price_1',STRIPE_WEBHOOK_SECRET:'hook',OPENAI_API_KEY:'model-key',OPENAI_MODEL:'test-model',MODEL_INPUT_MICROS_PER_TOKEN:'1',MODEL_OUTPUT_MICROS_PER_TOKEN:'2',REFLECTION_ACCOUNT_MICROS:'20000',REFLECTION_GLOBAL_MICROS:'50000'};
  let code,cookie='',modelCalls=0,paid=false,subscriptionPrice='price_1',subscriptionEnding=false;
  const checkoutKeys=[];
  const sessions=new Map();
  let loseCheckoutResponse=false;
  const customerKeys=[];
  const invoice={status:'paid',charge:{refunded:false,disputed:false}};
  const offer={active:true,currency:'cad',unit_amount:500,recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
  const yearlyOffer={...offer,unit_amount:5000,recurring:{...offer.recurring,interval:'year'}};
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).includes('resend.com')){code=JSON.parse(options.body).text.match(/[a-f0-9]{12}/)[0];return Response.json({id:'sent'});}
    if(String(url).endsWith('/customers')){
      customerKeys.push(options.headers['Idempotency-Key']);
      if(customerKeys.length===1)return Response.json({error:{code:'idempotency_key_in_use'}},{status:409});
      return Response.json({id:'cus_test'});
    }
    if(String(url).endsWith('/prices/price_1'))return Response.json(offer);
    if(String(url).endsWith('/prices/price_annual'))return Response.json(yearlyOffer);
    if(String(url).endsWith('/checkout/sessions')){
      const key=options.headers['Idempotency-Key'];
      checkoutKeys.push(key);
      assert.equal(options.body.get('automatic_tax[enabled]'),'true');
      assert.equal(options.body.get('customer_update[address]'),'auto');
      assert.equal(options.body.get('billing_address_collection'),'required');
      const price=options.body.get('line_items[0][price]');
      assert.equal(options.body.get('metadata[lacuna_price]'),price);
      assert.equal(options.body.get('metadata[terms_version]'),termsVersion);
      assert.equal(options.body.get('subscription_data[metadata][terms_version]'),termsVersion);
      if(!sessions.has(key)){
        const id='cs_'+sessions.size;
        sessions.set(key,{id,status:'open',url:'https://checkout.stripe.com/'+id,metadata:{lacuna_price:price,terms_version:options.body.get('metadata[terms_version]')},mode:'subscription',automatic_tax:{enabled:true}});
      }
      if(loseCheckoutResponse){loseCheckoutResponse=false;return new Response(null,{status:503});}
      return Response.json(sessions.get(key));
    }
    if(String(url).includes('/checkout/sessions?'))return Response.json({data:[...sessions.values()].filter(s=>s.status==='open')});
    if(String(url).includes('/checkout/sessions/')){
      const [,id,action]=new URL(url).pathname.match(/\/checkout\/sessions\/([^/]+)(?:\/(expire))?$/);
      const session=[...sessions.values()].find(s=>s.id===id);
      if(action==='expire'){
        if(session.status!=='open')return new Response(null,{status:400});
        session.status='expired';session.url=null;
      }
      return Response.json(session);
    }
    if(String(url).endsWith('/billing_portal/sessions'))return Response.json({url:'https://billing.stripe.com/test'});
    if(String(url).includes('/subscriptions?'))return Response.json({data:paid?[{status:'active',latest_invoice:invoice,cancel_at_period_end:subscriptionEnding,current_period_end:periodEnd,items:{data:[{price:{id:subscriptionPrice}}]}}]:[]});
    assert.equal(String(url),'https://api.openai.com/v1/responses');
    const payload=JSON.parse(options.body);assert.equal(payload.store,false);assert.match(payload.input,/\bJSON\b/i);modelCalls++;
    return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"notes":[]}'}]}],usage:{input_tokens:300,output_tokens:15}});
  });
  const paidRouter = new Hono();
  paidRouter.use('*', async (c, next) => { c.set('reflectionsAvailable', true); await next(); });
  paidRouter.route('/reflections', reflectionRoutes);
  let router = paidRouter;
  const periodEnd=Math.floor(Date.now()/1000)+365*86400;
  const send=(path,body,headers={})=>router.request('https://lacuna.example/reflections/'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie+'; __Host-lacuna-device='+'a'.repeat(64),Origin:env.FRONTEND_ORIGIN,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)},env);
  assert.equal((await send('login',{email:'me@example.com'})).status,200);
  const verify=await send('verify',{email:'me@example.com',code});
  cookie=verify.headers.get('set-cookie').split(';')[0];
  const account=await verify.json();
  assert.equal(account.paid,false);
  assert.equal((await send('checkout',{})).status,400);
  assert.equal((await send('checkout',{termsVersion:'2025-01-01'})).status,400);
  assert.equal(account.annualAvailable,false);
  assert.equal((await send('checkout',{termsVersion,interval:'year'})).status,503);
  env.STRIPE_ANNUAL_PRICE_ID='price_annual';
  assert.equal((await (await send('account')).json()).annualAvailable,true);
  assert.equal((await send('checkout',{termsVersion,interval:'week'})).status,400);
  yearlyOffer.unit_amount=500;
  assert.equal((await send('checkout',{termsVersion,interval:'year'})).status,503);
  yearlyOffer.unit_amount=5000;yearlyOffer.recurring.interval='month';
  assert.equal((await send('checkout',{termsVersion,interval:'year'})).status,503);
  yearlyOffer.recurring.interval='year';
  assert.equal((await send('account',undefined,{Cookie:cookie})).status,401);
  assert.equal((await send('account',undefined,{Cookie:cookie+'; __Host-lacuna-device='+'b'.repeat(64)})).status,401);
  assert.equal((await send('account')).status,200);
  const modelKey=env.OPENAI_API_KEY;
  delete env.OPENAI_API_KEY;
  assert.equal((await send('checkout',{termsVersion})).status,503);
  env.OPENAI_API_KEY=modelKey;
  offer.currency='usd';
  assert.equal((await send('checkout',{termsVersion})).status,503);
  offer.currency='cad';
  loseCheckoutResponse=true;
  assert.equal((await send('checkout',{termsVersion})).status,503);
  const monthly=await (await send('checkout',{termsVersion})).json();
  assert.equal(monthly.url,'https://checkout.stripe.com/cs_0');
  assert.equal((await (await send('checkout',{termsVersion,interval:'month'})).json()).url,monthly.url);
  assert.equal(sessions.size,1);
  assert.deepEqual(customerKeys,['customer-'+account.id,'customer-'+account.id]);
  const monthlySession=sessions.get(checkoutKeys[0]);
  assert.equal(monthlySession.metadata.lacuna_price,env.STRIPE_PRICE_ID);
  await DB.prepare('UPDATE reflection_accounts SET checkout_price=NULL,checkout_session=NULL WHERE id=?').bind(account.id).run();
  const annual=await (await send('checkout',{termsVersion,interval:'year'})).json();
  assert.equal(annual.url,'https://checkout.stripe.com/cs_1');
  assert.equal(monthlySession.status,'expired');
  const annualSession=[...sessions.values()].find(s=>s.url===annual.url);
  assert.equal(annualSession.metadata.lacuna_price,env.STRIPE_ANNUAL_PRICE_ID);
  assert.deepEqual(await (await send('checkout',{termsVersion,interval:'year'})).json(),annual);
  annualSession.status='expired';annualSession.url=null;
  const concurrent=await Promise.all([send('checkout',{termsVersion,interval:'month'}),send('checkout',{termsVersion,interval:'year'})]);
  assert.ok(concurrent.some(response=>response.status===200));
  assert.ok(concurrent.every(response=>[200,409].includes(response.status)));
  assert.equal([...sessions.values()].filter(s=>s.status==='open').length,1);
  const data={...nextBookTask(emptyBook(),pages),account:account.id,consent:1,unit:'a'.repeat(64)};
  assert.equal((await send('generate',data)).status,403);
  const event={type:'customer.subscription.updated',data:{object:{customer:'cus_test'}}};
  const stamp=Math.floor(Date.now()/1000),sig=createHmac('sha256','hook').update(stamp+'.'+JSON.stringify(event)).digest('hex');
  assert.equal((await send('webhook',event)).status,400);
  const hook=()=>send('webhook',event,{'Stripe-Signature':'t='+stamp+',v1='+sig});
  paid=true;
  assert.equal((await send('checkout',{termsVersion,interval:'year'})).status,409);
  await hook();
  assert.equal((await (await send('account')).json()).paid,true);
  subscriptionPrice='unrelated';await hook();
  assert.equal((await (await send('account')).json()).paid,false);
  subscriptionPrice='price_annual';
  assert.equal((await send('checkout',{termsVersion})).status,409);
  for(const [status,refunded,disputed,expectedPaid] of [
    ['open',false,false,false],['paid',true,false,false],['paid',false,true,false],['paid',false,false,true]
  ]){
    invoice.status=status;
    Object.assign(invoice.charge,{refunded,disputed});
    assert.equal((await hook()).status,200);
    assert.equal((await (await send('account')).json()).paid,expectedPaid);
  }
  subscriptionEnding=true;await hook();
  const ending=await (await send('account')).json();
  assert.equal(ending.billingState,'ending');
  assert.equal(ending.paidUntil,periodEnd);
  assert.equal((await send('generate',data)).status,403);
  assert.equal((await send('consent',{enabled:true})).status,400);
  assert.equal((await send('consent',{enabled:true,noticeVersion:'2026-11-24'})).status,200);
  assert.equal((await send('generate',data,{Origin:'https://elsewhere.example'})).status,403);
  assert.equal((await send('generate',data)).status,200);
  assert.equal(modelCalls,1);
  assert.equal((await (await send('generate',data)).json()).code,'unit_busy');
  const usage=await DB.prepare('SELECT * FROM reflection_usage').first();
  assert.equal(usage.micros,330);assert.ok(!JSON.stringify(usage).includes(pages[0].body));
  env.REFLECTION_ACCOUNT_MICROS='1';
  const capped=await (await send('generate',{...data,unit:'b'.repeat(64)})).json();
  assert.equal(capped.code,'subscriber_limit');
  assert.equal(new Date(capped.retryAt).getUTCDate(),1);
  env.REFLECTION_ACCOUNT_MICROS='20000';env.REFLECTION_GLOBAL_MICROS='1';
  assert.equal((await (await send('generate',{...data,unit:'b'.repeat(64)})).json()).code,'service_limit');
  paid=false;await hook();assert.equal((await send('generate',data)).status,403);
  assert.equal(modelCalls,1);
  router=app;
  env.REFLECTIONS_ENABLED='true';
  const fetchesBeforePause=t.mock.method(globalThis,'fetch',()=>{throw new Error('Unexpected provider call');});
  for (const [path, body] of [['consent',{enabled:true,noticeVersion:'2026-11-24'}],['checkout',{termsVersion}],['generate',data]]) {
    assert.equal((await send(path,body)).status,503);
  }
  assert.equal(fetchesBeforePause.mock.callCount(),0);
  fetchesBeforePause.mock.restore();
  assert.equal((await send('portal',{})).status,200);
  const currentTime=Date.now();
  const clock=t.mock.method(Date,'now',()=>currentTime+301000);
  assert.equal((await (await send('portal',{})).json()).code,'reauthenticate');
  clock.mock.restore();
  assert.equal((await hook()).status,200);
  assert.equal((await send('consent',{enabled:false})).status,200);
  assert.equal((await send('logout',{})).status,200);
  assert.equal((await send('account')).status,401);
});

test('scheduled retention removes expired records and preserves recent metering and valid logins',async t=>{
  const DB=await createTestDatabase();
  t.after(()=>DB.sqlite.close());
  const time=Math.floor(Date.now()/1000);
  await DB.prepare('INSERT INTO reflection_accounts(id,email) VALUES(?,?)').bind('owner','owner@example.test').run();
  for(const [id,expires,started] of [['expired',time-1,time-91*86400],['current',time+3600,time-89*86400]]){
    await DB.prepare('INSERT INTO reflection_challenges VALUES(?,?,?)').bind(id,'digest',expires).run();
    await DB.prepare('INSERT INTO reflection_sessions VALUES(?,?,?)').bind(id,'owner',expires).run();
    await DB.prepare('INSERT INTO reflection_usage(id,account,month,micros,unit,started) VALUES(?,?,?,?,?,?)').bind(id,'owner',new Date().toISOString().slice(0,7),100,id,started).run();
  }
  assert.equal((await app.request('https://lacuna.example/health/maintenance',{}, {DB})).status,503);
  await maintainAccounts({DB});
  assert.equal((await app.request('https://lacuna.example/health/maintenance',{}, {DB})).status,200);
  for(const [table,key] of [['reflection_challenges','email'],['reflection_sessions','id'],['reflection_usage','id']]){
    assert.deepEqual(DB.sqlite.prepare('SELECT '+key+' AS id FROM '+table).all().map(row=>row.id),['current']);
  }
  await DB.prepare('DELETE FROM reflection_accounts WHERE id=?').bind('owner').run();
  assert.equal((await DB.prepare('SELECT micros FROM erased_usage_totals').first()).micros,100);
  assert.equal(await DB.prepare('SELECT id FROM reflection_sessions').first(),null);
  assert.equal(await DB.prepare('SELECT id FROM reflection_usage').first(),null);
});

test('published Soul Map excerpts retain the original actor, direction and negation',()=>{
  const evidence=[page(1,1,'Dad and I walked home.'),page(2,2,'We did not stop.')];
  const task={kind:'write',primary:evidence.map(p=>p.id),evidence};
  const excerpts=evidence.map(p=>({id:p.id,sentence:p.body}));
  const render=(pair)=>sourceReadings(task,{readings:[{lens:'story_thread',text:'unverified gloss',excerpts:pair}]}).readings;
  assert.deepEqual(render([...excerpts].reverse()),[{lens:'story_thread',text:'Dad and I walked home.\n\nWe did not stop.',support:task.primary}]);
  assert.deepEqual(render([excerpts[0],{...excerpts[1],sentence:'We stopped.'}]),[]);
  assert.deepEqual(render([excerpts[0],excerpts[0]]),[]);
  const passage=sourceReadings(task,{prose:'Dad and I walked home. Dad and I walked home. You was walking.',readings:[]});
  assert.equal(passage.prose,'“Dad and I walked home.” You were walking.');
});
