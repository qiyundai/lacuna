import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SignJWT, jwtVerify } from 'jose';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../types.js';
import { checkRateLimit, privateRateKey, hashToken } from '../ratelimit.js';
import { reflectionInstructions, sourceReadings, validEvidenceRequest } from '../ai/book-prompts.js';

type Account = {id:string; email:string; customer:string|null; paid_until:number; consent:number; billing_revision:number; billing_state:string;billing_checked:number; checkout_key:string|null; checkout_started:number|null; checkout_price:string|null; checkout_session:string|null};
const route = new Hono<{Bindings:Env;Variables:{account:Account;session:string;authenticatedAt:number}}>();
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now()/1000);
const unavailable = () => new HTTPException(503,{message:'Hosted reflections are unavailable.'});
const emailOf = (v: unknown) => typeof v==='string' && v.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : '';
const entitled = (a:Account) => a.paid_until > now();
function modelBudget(env: Env) {
  const [accountCap, globalCap, inputRate, outputRate] = [
    env.REFLECTION_ACCOUNT_MICROS, env.REFLECTION_GLOBAL_MICROS,
    env.MODEL_INPUT_MICROS_PER_TOKEN, env.MODEL_OUTPUT_MICROS_PER_TOKEN
  ].map(Number);
  if (!env.OPENAI_MODEL || !env.OPENAI_API_KEY ||
      ![accountCap, globalCap, inputRate, outputRate].every(value => Number.isFinite(value) && value > 0)) {
    throw unavailable();
  }
  return {accountCap, globalCap, inputRate, outputRate};
}
const publicStatus = (a:Account,env:Env) => ({id:a.id,email:a.email,paid:entitled(a),paidUntil:a.paid_until,billingState:a.billing_state,customer:!!a.customer,consent:a.consent,annualAvailable:!!env.STRIPE_ANNUAL_PRICE_ID && env.STRIPE_ANNUAL_PRICE_ID!==env.STRIPE_PRICE_ID});
route.use('*',async(c,next)=>{
  if(!c.env.JWT_SECRET)throw unavailable();
  if(c.req.method==='POST' && !c.req.path.endsWith('/webhook') && c.req.header('Origin')!==c.env.FRONTEND_ORIGIN) return c.json({error:'Invalid origin.'},403);
  c.header('Cache-Control','no-store');
  await next();return;
});

route.post('/login',async c=>{
  const {email:input}=await c.req.json();
  const email=emailOf(input);
  if (!email) return c.json({error:'Enter a valid email address.'},400);
  if (!c.env.RESEND_API_KEY || !c.env.EMAIL_FROM) throw unavailable();
  const ip=await privateRateKey(c.req.header('CF-Connecting-IP')??'local',c.env.JWT_SECRET);
  if (!await checkRateLimit(c.env.DB,'mail:'+ip,10,900) || !await checkRateLimit(c.env.DB,'mail:'+await privateRateKey(email,c.env.JWT_SECRET),3,600) || !await checkRateLimit(c.env.DB,'mail-total',200,86400)) return c.json({error:'Try again later.'},429);
  const code=crypto.randomUUID().replaceAll('-','').slice(0,12);
  const digest=await hashToken(c.env.JWT_SECRET+':'+email+':'+code);
  await c.env.DB.prepare('INSERT OR REPLACE INTO reflection_challenges VALUES(?,?,?)').bind(email,digest,now()+600).run();
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+c.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:c.env.EMAIL_FROM,to:[email],subject:'Your Lacuna sign-in code',text:'Your sign-in code is '+code+'. It expires in ten minutes.'})});
  if (!sent.ok) {
    console.warn('mail_delivery_failed');
    await checkRateLimit(c.env.DB,'mail-failed',3,3600);
    throw unavailable();
  }
  return c.json({ok:true});
});
route.post('/verify',async c=>{
  const input=await c.req.json(),email=emailOf(input.email);
  if (!email || typeof input.code!=='string' || !/^[0-9a-f]{12}$/i.test(input.code)) return c.json({error:'Check your email and code.'},400);
  const device = getCookie(c,'__Host-lacuna-device') ?? '';
  if (!/^[a-f0-9]{64}$/.test(device)) return c.json({error:'Enable secure cookies and sign in again.'},400);
  const peer = await privateRateKey(c.req.header('CF-Connecting-IP') ?? 'local',c.env.JWT_SECRET);
  if (!await checkRateLimit(c.env.DB,'verify:'+peer,60,900) ||
      !await checkRateLimit(c.env.DB,'verify:'+await privateRateKey(email,c.env.JWT_SECRET),15,600)) return c.json({error:'Try again later.'},429);
  const digest=await hashToken(c.env.JWT_SECRET+':'+email+':'+input.code.toLowerCase());
  const used=await c.env.DB.prepare('DELETE FROM reflection_challenges WHERE email=? AND digest=? AND expires>? RETURNING email').bind(email,digest,now()).first();
  if (!used) return c.json({error:'Code expired or incorrect.'},401);
  const account=await c.env.DB.prepare('INSERT INTO reflection_accounts(id,email) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING *').bind(crypto.randomUUID(),email).first<Account>();
  if (!account) throw unavailable();
  const session=crypto.randomUUID();
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM reflection_sessions WHERE expires<=?').bind(now()),c.env.DB.prepare('INSERT INTO reflection_sessions VALUES(?,?,?)').bind(session,account.id,now()+2592000)]);
  const token=await new SignJWT({device:await hashToken(device)}).setProtectedHeader({alg:'HS256'}).setIssuer('lacuna-book').setAudience('reflections').setSubject(account.id).setJti(session).setIssuedAt().setExpirationTime('30d').sign(encoder.encode(c.env.JWT_SECRET));
  setCookie(c,'lacuna_book',token,{path:'/reflections',httpOnly:true,secure:true,sameSite:'Strict',maxAge:2592000});
  return c.json(publicStatus(account,c.env));
});

type Subscriptions = {data:{status:string;cancel_at_period_end?:boolean;cancel_at?:number|null;current_period_end:number;latest_invoice?:{status:string;charge?:{refunded:boolean;disputed:boolean}|null};items:{data:{price:{id:string}}[]}}[]};
function reflectionPrice(env:Env,id:string) {
  return !!id && (id===env.STRIPE_PRICE_ID || id===env.STRIPE_ANNUAL_PRICE_ID);
}
async function stripe<T={id:string;url:string}>(env:Env,path:string,fields?:Record<string,string>,idempotency?:string):Promise<T> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) throw unavailable();
  const headers:Record<string,string>={Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':'2024-06-20'};
  if (idempotency) headers['Idempotency-Key']=idempotency;
  for (let attempt=0; ; attempt++) {
    const res=await fetch('https://api.stripe.com/v1/'+path,{method:fields?'POST':'GET',headers,body:fields?new URLSearchParams(fields):undefined});
    if (res.ok) return await res.json() as T;
    if (!idempotency || res.status!==409 || attempt>=3) throw unavailable();
    const problem=await res.json() as {error?:{code?:string}};
    if (problem.error?.code!=='idempotency_key_in_use') throw unavailable();
    await new Promise(resolve=>setTimeout(resolve,200*2**attempt));
  }
}
async function reconcileBilling(env:Env,account:Account) {
  const list=await stripe<Subscriptions>(env,'subscriptions?customer='+encodeURIComponent(account.customer!)+'&status=all&limit=100&expand[]=data.latest_invoice.charge');
  const matching=list.data.filter(s=>s.items.data.some(i=>reflectionPrice(env,i.price.id)));
  const active=matching.filter(s=>s.status==='active' && s.latest_invoice?.status==='paid' && !s.latest_invoice.charge?.refunded && !s.latest_invoice.charge?.disputed).sort((a,b)=>b.current_period_end-a.current_period_end)[0];
  const end=active ? Math.min(active.current_period_end,active.cancel_at??Infinity) : 0;
  const state=active ? (active.cancel_at_period_end || active.cancel_at ? 'ending' : 'active') : matching.some(s=>s.status==='active') ? 'payment_review' : matching[0]?.status??'none';
  const write=await env.DB.prepare('UPDATE reflection_accounts SET paid_until=?,billing_state=?,billing_checked=?,billing_revision=billing_revision+1 WHERE id=? AND billing_revision=?').bind(end,state,now(),account.id,account.billing_revision).run();
  if (!write.meta.changes) throw unavailable();
}

export async function maintainAccounts(env:Env) {
  const time = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reflection_challenges WHERE expires<=?').bind(time),
    env.DB.prepare('DELETE FROM reflection_sessions WHERE expires<=?').bind(time),
    env.DB.prepare('DELETE FROM reflection_usage WHERE started<?').bind(time-90*86400),
    env.DB.prepare("DELETE FROM erased_usage_totals WHERE month<strftime('%Y-%m','now')"),
    env.DB.prepare('DELETE FROM rate_limits WHERE window_end<=?').bind(time)
  ]);
  const {results} = await env.DB.prepare('SELECT * FROM reflection_accounts WHERE customer IS NOT NULL AND billing_checked<? ORDER BY billing_checked LIMIT 20').bind(time-86400).all<Account>();
  const outcomes=await Promise.allSettled(results.map(async account=>{
    try { await reconcileBilling(env,account); }
    catch (error) {
      await env.DB.prepare('UPDATE reflection_accounts SET billing_checked=? WHERE id=? AND billing_checked=?').bind(time-86400+900,account.id,account.billing_checked).run();
      throw error;
    }
  }));
  const reconciled=outcomes.every(result=>result.status==='fulfilled');
  const bucket=Math.floor(time/86400);
  const pressure=await env.DB.prepare(
    'SELECT used_bytes>=? OR EXISTS (SELECT 1 FROM rate_limits WHERE (key=? AND count>=160) OR (key=? AND count>=16000) OR (key=? AND count>=3)) '+
    'OR EXISTS (SELECT 1 FROM reflection_accounts WHERE customer IS NOT NULL AND billing_checked<?) AS elevated FROM sync_capacity WHERE id=1'
  ).bind(Number(env.SYNC_CAPACITY_BYTES??134217728)*0.8,'mail-total:'+bucket,'sync-writes:'+bucket,'mail-failed:'+Math.floor(time/3600),time-2*86400).first<{elevated:number}>();
  await env.DB.prepare('INSERT OR REPLACE INTO maintenance_status(id,checked,healthy) VALUES(1,?,?)')
    .bind(time,Number(reconciled && pressure?.elevated===0)).run();
  if (!reconciled) throw new Error('billing_reconciliation_failed');
}

async function signedEvent(raw:string,header:string,secret:string) {
  const fields=header.split(','), stamp=fields.find(v=>v.startsWith('t='))?.slice(2);
  if (!stamp || !/^\d+$/.test(stamp) || Math.abs(now()-Number(stamp))>300) return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  for (const item of fields.filter(v=>/^v1=[\da-f]{64}$/.test(v))) {
    const sig=Uint8Array.from(item.slice(3).match(/../g)!,v=>parseInt(v,16));
    if(await crypto.subtle.verify('HMAC',key,sig,encoder.encode(stamp+'.'+raw))) return true;
  }
  return false;
}
route.post('/webhook',async c=>{
  const raw=await c.req.text();
  if (!c.env.STRIPE_WEBHOOK_SECRET || !await signedEvent(raw,c.req.header('Stripe-Signature')??'',c.env.STRIPE_WEBHOOK_SECRET)) { console.warn('billing_signature_rejected'); return c.json({error:'Invalid signature.'},400); }
  const event=JSON.parse(raw);
  if (!['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','checkout.session.completed'].includes(event.type)) return c.json({ok:true});
  const customer=event.data?.object?.customer;
  if (typeof customer!=='string') return c.json({ok:true});
  const account=await c.env.DB.prepare('SELECT * FROM reflection_accounts WHERE customer=?').bind(customer).first<Account>();
  if (!account) return c.json({ok:true});
  await reconcileBilling(c.env,account);
  return c.json({ok:true});
});
route.use('*',async(c,next)=>{
  let id,session,authenticatedAt;
  const device = getCookie(c,'__Host-lacuna-device') ?? '';
  if (!/^[a-f0-9]{64}$/.test(device)) return c.json({error:'Sign in to Lacuna.'},401);
  try {const {payload}=await jwtVerify(getCookie(c,'lacuna_book')??'',encoder.encode(c.env.JWT_SECRET),{issuer:'lacuna-book',audience:'reflections',algorithms:['HS256']});if(payload.device!==await hashToken(device)) return c.json({error:'Sign in again.'},401);
    id=payload.sub;session=payload.jti;authenticatedAt=payload.iat;} catch {return c.json({error:'Sign in to Lacuna.'},401);}
  if(!session || !id || !authenticatedAt)return c.json({error:'Sign in to Lacuna.'},401);
  const account=await c.env.DB.prepare('SELECT a.* FROM reflection_accounts a JOIN reflection_sessions s ON s.account=a.id WHERE a.id=? AND s.id=? AND s.expires>?').bind(id,session,now()).first<Account>();
  if (!account) return c.json({error:'Sign in to Lacuna.'},401);
  c.set('authenticatedAt',authenticatedAt);c.set('account',account);c.set('session',session);await next();return;
});
route.get('/account',c=>c.json(publicStatus(c.get('account'),c.env)));
route.post('/logout',async c=>{
  await c.env.DB.prepare('DELETE FROM reflection_sessions WHERE id=?').bind(c.get('session')).run();
  deleteCookie(c,'lacuna_book',{path:'/reflections'});return c.json({ok:true});
});
route.post('/consent',async c=>{
  const {enabled}=await c.req.json(),a=c.get('account');
  if (enabled === true && c.env.REFLECTIONS_ENABLED !== 'true') return c.json({error:'New reflections are paused.'},503);
  if (typeof enabled!=='boolean' || (enabled && !entitled(a))) return c.json({error:'An active subscription is required.'},403);
  const updated=await c.env.DB.prepare('UPDATE reflection_accounts SET consent=consent+CASE WHEN consent%2=? THEN 0 ELSE 1 END WHERE id=? RETURNING *').bind(Number(enabled),a.id).first<Account>();
  return c.json(publicStatus(updated!,c.env));
});
type CheckoutSession = {id:string; status:'open'|'expired'|'complete'; url:string|null; mode:string; automatic_tax?:{enabled:boolean}; metadata?:{lacuna_price?:string}};

function createCheckout(env:Env,customer:string,price:string,key:string) {
  const url=env.FRONTEND_ORIGIN+'/';
  return stripe<CheckoutSession>(env,'checkout/sessions',{
    customer, mode:'subscription', 'line_items[0][price]':price, 'line_items[0][quantity]':'1',
    'automatic_tax[enabled]':'true', billing_address_collection:'required', 'customer_update[address]':'auto',
    'metadata[lacuna_price]':price, success_url:url+'?billing=returned', cancel_url:url+'?billing=cancelled'
  },'checkout-'+price+'-'+key);
}

async function previousCheckout(env:Env,account:Account,customer:string) {
  let id=account.checkout_session;
  if (!id) {
    const open=await stripe<{data:CheckoutSession[]}>(env,'checkout/sessions?status=open&customer='+encodeURIComponent(customer)+'&limit=100');
    const existing=open.data.find(s=>s.mode==='subscription' && reflectionPrice(env,s.metadata?.lacuna_price??''));
    if (existing) return existing;
    if (!account.checkout_key || (account.checkout_started??0)<=now()-86400) return null;
    const price=account.checkout_price??env.STRIPE_PRICE_ID!;
    id=(await createCheckout(env,customer,price,account.checkout_key)).id;
  }
  return stripe<CheckoutSession>(env,'checkout/sessions/'+encodeURIComponent(id));
}

async function existingSubscription(env:Env,customer:string) {
  const list=await stripe<Subscriptions>(env,'subscriptions?customer='+encodeURIComponent(customer)+'&status=all&limit=100');
  return list.data.find(s=>!['canceled','incomplete_expired'].includes(s.status) && s.items.data.some(i=>reflectionPrice(env,i.price.id)));
}

route.post('/checkout',async c=>{
  const a=c.get('account');
  if (entitled(a)) return c.json({error:'Your subscription is already active.'},409);
  modelBudget(c.env);
  if (!c.env.STRIPE_WEBHOOK_SECRET) throw unavailable();
  const body=await c.req.text();
  const input=body ? JSON.parse(body) : {};
  if (!input || typeof input!=='object' || Array.isArray(input) || ![undefined,'month','year'].includes(input.interval))
    return c.json({error:'Choose monthly or annual billing.'},400);
  const annual=input.interval==='year';
  const price=annual ? c.env.STRIPE_ANNUAL_PRICE_ID : c.env.STRIPE_PRICE_ID;
  if (!price || (annual && price===c.env.STRIPE_PRICE_ID)) throw unavailable();
  const offer = await stripe<{active:boolean;currency:string;unit_amount:number;recurring?:{interval:string;interval_count:number;usage_type:string}}>(
    c.env, 'prices/'+encodeURIComponent(price)
  );
  if (!offer.active || offer.currency!=='cad' || offer.unit_amount!==(annual?5000:500) ||
      offer.recurring?.interval!==(annual?'year':'month') || offer.recurring.interval_count!==1 || offer.recurring.usage_type!=='licensed') throw unavailable();
  let customer=a.customer;
  if (!customer) {
    customer=(await stripe(c.env,'customers',{email:a.email},'customer-'+a.id)).id;
    await c.env.DB.prepare('UPDATE reflection_accounts SET customer=? WHERE id=?').bind(customer,a.id).run();
  }
  const existingPlan=await existingSubscription(c.env,customer);
  if(existingPlan)return c.json({error:existingPlan.status==='active'?'Payment received. Check billing status in a moment.':'You already have a subscription. Open Manage billing to review it.'},409);
  const previous=await previousCheckout(c.env,a,customer);
  if (previous?.status==='open') {
    if (previous.url && previous.automatic_tax?.enabled && previous.metadata?.lacuna_price===price)
      return c.json({url:previous.url});
    await stripe(c.env,'checkout/sessions/'+encodeURIComponent(previous.id)+'/expire',{});
  }
  if (previous && await existingSubscription(c.env,customer))
    return c.json({error:'You already have a subscription. Open Manage billing to review it.'},409);
  const key=crypto.randomUUID();
  const claim=await c.env.DB.prepare(
    'UPDATE reflection_accounts SET checkout_key=?,checkout_price=?,checkout_started=?,checkout_session=NULL WHERE id=? AND checkout_key IS ?'
  ).bind(key,price,now(),a.id,a.checkout_key).run();
  if (!claim.meta.changes) return c.json({error:'Another checkout is in progress. Try again to review your choice.'},409);
  const session=await createCheckout(c.env,customer,price,key);
  const saved=await c.env.DB.prepare('UPDATE reflection_accounts SET checkout_session=? WHERE id=? AND checkout_key=?').bind(session.id,a.id,key).run();
  if (!saved.meta.changes || !session.url) return c.json({error:'Checkout changed. Try again to review your choice.'},409);
  return c.json({url:session.url});
});
route.post('/portal',async c=>{
  if(now()-c.get('authenticatedAt')>300) return c.json({code:'reauthenticate',error:'Verify your email again.'},403);
  if (!await checkRateLimit(c.env.DB,'portal:'+c.get('account').id,10,600)) return c.json({error:'Try again later.'},429);
  const customer=c.get('account').customer;
  if (!customer) return c.json({error:'No billing account yet.'},400);
  return c.json({url:(await stripe(c.env,'billing_portal/sessions',{customer,return_url:c.env.FRONTEND_ORIGIN+'/?billing=managed'})).url});
});
route.post('/generate',async c=>{
  const a=c.get('account'), input=await c.req.json();
  if (!entitled(a) || !(a.consent%2) || input?.consent!==a.consent || input.account!==a.id) return c.json({error:'Paid access and consent are required.'},403);
  if (typeof input.unit!=='string' || !/^[a-f0-9]{64}$/.test(input.unit) || !validEvidenceRequest(input)) return c.json({error:'Invalid source material.'},400);
  const model=c.env.OPENAI_MODEL;
  const {accountCap,globalCap,inputRate,outputRate}=modelBudget(c.env);
  const instructions=reflectionInstructions(input.kind), content='Return JSON.\n'+JSON.stringify({primary:input.primary,pages:input.evidence});
  const maxOutput=input.kind==='observe'?500:1400;
  const reserve=Math.ceil((encoder.encode(content+instructions).length+256)*inputRate+maxOutput*outputRate);
  const month=new Date().toISOString().slice(0,7),id=crypto.randomUUID();
  const reservation=await c.env.DB.prepare(`INSERT INTO reflection_usage(id,account,month,micros,unit,started) SELECT ?,?,?,?,?,?
    WHERE EXISTS (SELECT 1 FROM reflection_accounts a JOIN reflection_sessions s ON s.account=a.id
      WHERE a.id=? AND a.consent=? AND a.paid_until>? AND s.id=? AND s.expires>?)
    AND (SELECT COALESCE(SUM(micros),0) FROM reflection_usage WHERE month=? AND account=?) + ? <= ?
    AND (SELECT COALESCE(SUM(micros),0) FROM reflection_usage WHERE month=?) + COALESCE((SELECT micros FROM erased_usage_totals WHERE month=?),0) + ? <= ?
    AND NOT EXISTS(SELECT 1 FROM reflection_usage WHERE account=? AND unit=? AND started>?)
    AND (SELECT COUNT(*) FROM reflection_usage WHERE account=? AND month=? AND unit=?)<3`)
    .bind(id,a.id,month,reserve,input.unit,now(),a.id,a.consent,now(),c.get('session'),now(),month,a.id,reserve,accountCap,month,month,reserve,globalCap,a.id,input.unit,now()-120,a.id,month,input.unit).run();
  if (!reservation.meta.changes) {
    const authorized = await c.env.DB.prepare('SELECT 1 FROM reflection_accounts a JOIN reflection_sessions s ON s.account=a.id WHERE a.id=? AND a.consent=? AND a.paid_until>? AND s.id=? AND s.expires>?')
      .bind(a.id,a.consent,now(),c.get('session'),now()).first();
    if (!authorized) return c.json({error:'Reflection permission changed.'},403);
    const usage=await c.env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN account=? THEN micros END),0) AS personal,
      COALESCE(SUM(micros),0)+COALESCE((SELECT micros FROM erased_usage_totals WHERE month=?),0) AS total, COUNT(CASE WHEN account=? AND unit=? THEN 1 END) AS attempts
      FROM reflection_usage WHERE month=?`).bind(a.id,month,a.id,input.unit,month).first<{personal:number;total:number;attempts:number}>();
    if (!usage) throw unavailable();
    const reset=new Date(month+'-01T00:00:00Z');
    reset.setUTCMonth(reset.getUTCMonth()+1);
    const retryAt=reset.getTime();
    if(usage.personal+reserve>accountCap)return c.json({code:'subscriber_limit',error:'Your monthly reflection allowance is used up.',retryAt},429);
    if(usage.total+reserve>globalCap)console.warn('reflection_budget_exhausted');
    if(usage.total+reserve>globalCap)return c.json({code:'service_limit',error:'Lacuna has reached its shared monthly reflection limit.',retryAt},429);
    if(usage.attempts>=3)return c.json({code:'unit_limit',error:'Lacuna paused after several attempts on these pages.',retryAt},429);
    return c.json({code:'unit_busy',error:'These pages were recently requested. Lacuna will check again shortly.',retryAt:Date.now()+120000},429);
  }
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.any([c.req.raw.signal,AbortSignal.timeout(90000)]),headers:{Authorization:'Bearer '+c.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions,input:content,max_output_tokens:maxOutput,text:{format:{type:'json_object'}}})});
  if (!response.ok) {
    if(response.status>=400 && response.status<500)await c.env.DB.prepare('DELETE FROM reflection_usage WHERE id=?').bind(id).run();
    throw unavailable();
  }
  const output=await response.json() as {status:string;usage?:{input_tokens:number;output_tokens:number};output?:{content?:{type:string;text:string}[]}[]};
  if (output.usage && Number.isSafeInteger(output.usage.input_tokens) && Number.isSafeInteger(output.usage.output_tokens)) {
    const {input_tokens,output_tokens}=output.usage;
    await c.env.DB.prepare('UPDATE reflection_usage SET micros=?,input_tokens=?,output_tokens=? WHERE id=?').bind(Math.ceil(input_tokens*inputRate+output_tokens*outputRate),input_tokens,output_tokens,id).run();
  }
  const fresh=await c.env.DB.prepare('SELECT * FROM reflection_accounts WHERE id=?').bind(a.id).first<Account>();
  if (!fresh || fresh.consent!==a.consent || !entitled(fresh)) return c.json({error:'Reflection access changed.'},403);
  const value=output.output?.flatMap(o=>o.content??[]).find(p=>p.type==='output_text')?.text;
  if (!value || output.status!=='completed') throw unavailable();
  try {return c.json({result:sourceReadings(input,JSON.parse(value))});} catch {throw unavailable();}
});
export default route;
