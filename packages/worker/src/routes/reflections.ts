import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { SignJWT, jwtVerify } from 'jose';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../types.js';
import { checkRateLimit, privateRateKey } from '../ratelimit.js';
import { hashToken } from './auth.js';
import { reflectionInstructions, validEvidenceRequest } from '../ai/book-prompts.js';

type Account = {id:string; email:string; customer:string|null; paid_until:number; consent:number; billing_revision:number};
const route = new Hono<{Bindings:Env;Variables:{account:Account;session:string}}>();
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now()/1000);
const unavailable = () => new HTTPException(503,{message:'Hosted reflections are unavailable.'});
const emailOf = (v: unknown) => typeof v==='string' && v.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : '';
const entitled = (a:Account) => a.paid_until > now();
const publicStatus = (a:Account) => ({id:a.id,email:a.email,paid:entitled(a),customer:!!a.customer,consent:a.consent});
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
  if (!await checkRateLimit(c.env.DB,'mail:'+ip,10,900) || !await checkRateLimit(c.env.DB,'mail:'+await hashToken(email),3,600)) return c.json({error:'Try again later.'},429);
  const code=crypto.randomUUID().replaceAll('-','').slice(0,12);
  const digest=await hashToken(c.env.JWT_SECRET+':'+email+':'+code);
  await c.env.DB.prepare('INSERT OR REPLACE INTO reflection_challenges VALUES(?,?,?)').bind(email,digest,now()+600).run();
  const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+c.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:c.env.EMAIL_FROM,to:[email],subject:'Your Lacuna sign-in code',text:'Your sign-in code is '+code+'. It expires in ten minutes.'})});
  if (!sent.ok) throw unavailable();
  return c.json({ok:true});
});
route.post('/verify',async c=>{
  const input=await c.req.json(),email=emailOf(input.email);
  if (!email || typeof input.code!=='string' || !/^[0-9a-f]{12}$/i.test(input.code)) return c.json({error:'Check your email and code.'},400);
  const digest=await hashToken(c.env.JWT_SECRET+':'+email+':'+input.code.toLowerCase());
  const used=await c.env.DB.prepare('DELETE FROM reflection_challenges WHERE email=? AND digest=? AND expires>? RETURNING email').bind(email,digest,now()).first();
  if (!used) return c.json({error:'Code expired or incorrect.'},401);
  const account=await c.env.DB.prepare('INSERT INTO reflection_accounts(id,email) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING *').bind(crypto.randomUUID(),email).first<Account>();
  if (!account) throw unavailable();
  const session=crypto.randomUUID();
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM reflection_sessions WHERE expires<=?').bind(now()),c.env.DB.prepare('INSERT INTO reflection_sessions VALUES(?,?,?)').bind(session,account.id,now()+2592000)]);
  const token=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setIssuer('lacuna-book').setAudience('reflections').setSubject(account.id).setJti(session).setIssuedAt().setExpirationTime('30d').sign(encoder.encode(c.env.JWT_SECRET));
  setCookie(c,'lacuna_book',token,{path:'/reflections',httpOnly:true,secure:true,sameSite:'Strict',maxAge:2592000});
  return c.json(publicStatus(account));
});

type Subscriptions = {data:{current_period_end:number;items:{data:{price:{id:string}}[]}}[]};
async function stripe<T={id:string;url:string}>(env:Env,path:string,fields?:Record<string,string>,idempotency?:string):Promise<T> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) throw unavailable();
  const headers:Record<string,string>={Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':'2024-06-20'};
  if (idempotency) headers['Idempotency-Key']=idempotency;
  const res=await fetch('https://api.stripe.com/v1/'+path,{method:fields?'POST':'GET',headers,body:fields?new URLSearchParams(fields):undefined});
  if (!res.ok) throw unavailable();
  return await res.json() as T;
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
  if (!c.env.STRIPE_WEBHOOK_SECRET || !await signedEvent(raw,c.req.header('Stripe-Signature')??'',c.env.STRIPE_WEBHOOK_SECRET)) return c.json({error:'Invalid signature.'},400);
  const event=JSON.parse(raw);
  if (!['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','checkout.session.completed'].includes(event.type)) return c.json({ok:true});
  const customer=event.data?.object?.customer;
  if (typeof customer!=='string') return c.json({ok:true});
  const account=await c.env.DB.prepare('SELECT * FROM reflection_accounts WHERE customer=?').bind(customer).first<Account>();
  if (!account) return c.json({ok:true});
  const list=await stripe<Subscriptions>(c.env,'subscriptions?customer='+encodeURIComponent(customer)+'&status=active&limit=100');
  const end=Math.max(0,...list.data.filter(s=>s.items.data.some(i=>i.price.id===c.env.STRIPE_PRICE_ID)).map(s=>s.current_period_end));
  const write=await c.env.DB.prepare('UPDATE reflection_accounts SET paid_until=?,billing_revision=billing_revision+1 WHERE id=? AND billing_revision=?').bind(end,account.id,account.billing_revision).run();
  if (!write.meta.changes) throw unavailable();
  return c.json({ok:true});
});
route.use('*',async(c,next)=>{
  let id,session;
  try {const {payload}=await jwtVerify(getCookie(c,'lacuna_book')??'',encoder.encode(c.env.JWT_SECRET),{issuer:'lacuna-book',audience:'reflections',algorithms:['HS256']});id=payload.sub;session=payload.jti;} catch {return c.json({error:'Sign in to Lacuna.'},401);}
  if(!session || !id)return c.json({error:'Sign in to Lacuna.'},401);
  const account=await c.env.DB.prepare('SELECT a.* FROM reflection_accounts a JOIN reflection_sessions s ON s.account=a.id WHERE a.id=? AND s.id=? AND s.expires>?').bind(id,session,now()).first<Account>();
  if (!account) return c.json({error:'Sign in to Lacuna.'},401);
  c.set('account',account);c.set('session',session);await next();return;
});
route.get('/account',c=>c.json(publicStatus(c.get('account'))));
route.post('/logout',async c=>{
  await c.env.DB.prepare('DELETE FROM reflection_sessions WHERE id=?').bind(c.get('session')).run();
  deleteCookie(c,'lacuna_book',{path:'/reflections'});return c.json({ok:true});
});
route.post('/consent',async c=>{
  const {enabled}=await c.req.json(),a=c.get('account');
  if (typeof enabled!=='boolean' || (enabled && !entitled(a))) return c.json({error:'An active subscription is required.'},403);
  const updated=await c.env.DB.prepare('UPDATE reflection_accounts SET consent=consent+CASE WHEN consent%2=? THEN 0 ELSE 1 END WHERE id=? RETURNING *').bind(Number(enabled),a.id).first<Account>();
  return c.json(publicStatus(updated!));
});
route.post('/checkout',async c=>{
  const a=c.get('account');
  if (entitled(a)) return c.json({error:'Your subscription is already active.'},409);
  let customer=a.customer;
  if (!customer) {
    customer=(await stripe(c.env,'customers',{email:a.email},'customer-'+a.id)).id;
    await c.env.DB.prepare('UPDATE reflection_accounts SET customer=? WHERE id=?').bind(customer,a.id).run();
  }
  const url=c.env.FRONTEND_ORIGIN+'/';
  const active=await stripe<Subscriptions>(c.env,'subscriptions?customer='+encodeURIComponent(customer)+'&status=active&limit=100');
  if(active.data.some(s=>s.items.data.some(i=>i.price.id===c.env.STRIPE_PRICE_ID)))return c.json({error:'Payment received. Reopen settings when billing finishes updating.'},409);
  const open=await stripe<{data:{url:string;mode:string}[]}>(c.env,'checkout/sessions?status=open&customer='+encodeURIComponent(customer)+'&limit=10');
  const existing=open.data.find(s=>s.mode==='subscription' && s.url);
  if(existing)return c.json({url:existing.url});
  const session=await stripe(c.env,'checkout/sessions',{customer,mode:'subscription','line_items[0][price]':c.env.STRIPE_PRICE_ID!,'line_items[0][quantity]':'1',success_url:url+'?billing=returned',cancel_url:url},'checkout-'+a.id+'-'+Math.floor(now()/1800));
  return c.json({url:session.url});
});
route.post('/portal',async c=>{
  const customer=c.get('account').customer;
  if (!customer) return c.json({error:'No billing account yet.'},400);
  return c.json({url:(await stripe(c.env,'billing_portal/sessions',{customer,return_url:c.env.FRONTEND_ORIGIN+'/'})).url});
});
route.post('/generate',async c=>{
  const a=c.get('account'), input=await c.req.json();
  if (!entitled(a) || !(a.consent%2) || input?.consent!==a.consent || input.account!==a.id) return c.json({error:'Paid access and consent are required.'},403);
  if (typeof input.unit!=='string' || !/^[a-f0-9]{64}$/.test(input.unit) || !validEvidenceRequest(input)) return c.json({error:'Invalid source material.'},400);
  const model=c.env.OPENAI_MODEL;
  const limits=[c.env.REFLECTION_ACCOUNT_MICROS,c.env.REFLECTION_GLOBAL_MICROS,c.env.MODEL_INPUT_MICROS_PER_TOKEN,c.env.MODEL_OUTPUT_MICROS_PER_TOKEN].map(Number);
  if (!model || !c.env.OPENAI_API_KEY || !limits.every(x=>Number.isFinite(x)&&x>0)) throw unavailable();
  const [accountCap,globalCap,inputRate,outputRate]=limits;
  const instructions=reflectionInstructions(input.kind), content=JSON.stringify({primary:input.primary,pages:input.evidence});
  const maxOutput=input.kind==='observe'?500:1400;
  const reserve=Math.ceil((encoder.encode(content+instructions).length+256)*inputRate+maxOutput*outputRate);
  const month=new Date().toISOString().slice(0,7),id=crypto.randomUUID();
  const reservation=await c.env.DB.prepare(`INSERT INTO reflection_usage(id,account,month,micros,unit,started) SELECT ?,?,?,?,?,?
    WHERE (SELECT COALESCE(SUM(micros),0) FROM reflection_usage WHERE month=? AND account=?) + ? <= ?
    AND (SELECT COALESCE(SUM(micros),0) FROM reflection_usage WHERE month=?) + ? <= ?
    AND NOT EXISTS(SELECT 1 FROM reflection_usage WHERE account=? AND unit=? AND started>?)
    AND (SELECT COUNT(*) FROM reflection_usage WHERE account=? AND month=? AND unit=?)<3`)
    .bind(id,a.id,month,reserve,input.unit,now(),month,a.id,reserve,accountCap,month,reserve,globalCap,a.id,input.unit,now()-120,a.id,month,input.unit).run();
  if (!reservation.meta.changes) return c.json({error:'Reflection allowance reached. Your journal is saved.'},429);
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
  try {return c.json({result:JSON.parse(value)});} catch {throw unavailable();}
});
export default route;
