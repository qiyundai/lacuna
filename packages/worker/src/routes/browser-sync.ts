import { Hono } from 'hono';
import { validPacket } from '../../../shared/sync-packet.js';
import { checkRateLimit, privateRateKey, hashToken } from '../ratelimit.js';
import type { Env } from '../types.js';

export function syncOrigins(env: Env): string[] {
  const primary = env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  return env.LEGACY_SYNC_ORIGIN ? [primary, env.LEGACY_SYNC_ORIGIN] : [primary];
}

const route = new Hono<{Bindings:Env; Variables:{slot:string; peer:string}}>();
route.use('*', async (c,next) => {
  if (!c.env.JWT_SECRET) return c.json({error:'Sync is unavailable.'},503);
  if (c.req.method !== 'GET' && !syncOrigins(c.env).includes(c.req.header('Origin') ?? '')) return c.body(null,403);
  const match = /^Bearer ([a-f0-9]{64})$/.exec(c.req.header('Authorization') ?? '');
  if (!match) return c.body(null,401);
  const peer = await privateRateKey(c.req.header('CF-Connecting-IP') ?? 'local',c.env.JWT_SECRET);
  if (!await checkRateLimit(c.env.DB,'browser-sync:'+peer,720,3600)) return c.body(null,429);
  c.set('peer',peer);
  c.set('slot',await hashToken(match[1]!));
  await next();
  return;
});

route.get('/',async c => {
  const slot=c.get('slot'), db=c.env.DB;
  const known=Number(/^"(\d+)"$/.exec(c.req.header('If-None-Match') ?? '')?.[1] ?? -1);
  const [head,parts]=await db.batch([
    db.prepare('SELECT version, iv FROM browser_sync WHERE slot=?').bind(slot),
    db.prepare('SELECT ciphertext FROM browser_sync_chunks WHERE slot=? AND EXISTS (SELECT 1 FROM browser_sync WHERE slot=? AND version!=?) ORDER BY part').bind(slot,slot,Number.isSafeInteger(known)?known:-1)
  ]);
  const row=head!.results[0] as {iv:string|null;version:number}|undefined;
  if (!row) return c.body(null,404);
  if (!row.iv) return c.body(null,410);
  c.header('ETag','"'+row.version+'"');
  if (row.version===known) return c.body(null,304);
  return c.json({version:row.version,iv:row.iv,ciphertext:parts!.results.map(r=>(r as {ciphertext:string}).ciphertext).join('')});
});

route.put('/',async c => {
  const packet=await c.req.json();
  if (!validPacket(packet)) return c.body(null,400);
  const slot=c.get('slot'), db=c.env.DB, marker=crypto.randomUUID();
  if (packet.version===1 && (!await checkRateLimit(db,'browser-create:'+c.get('peer'),8,86400) || !await checkRateLimit(db,'sync-new-slots',256,86400))) return c.body(null,429);
  const size = packet.ciphertext.length;
  const capacity = Number(c.env.SYNC_CAPACITY_BYTES ?? 134217728);
  if (!Number.isSafeInteger(capacity) || capacity < 1) return c.body(null,503);
  const available = '(SELECT used_bytes FROM sync_capacity WHERE id=1)';
  const existing = '(SELECT COALESCE(SUM(length(ciphertext)),0) FROM browser_sync_chunks WHERE slot=?)';
  const write=packet.version===1
    ? db.prepare('INSERT INTO browser_sync SELECT ?,1,?,? WHERE '+available+'+?<=? ON CONFLICT DO NOTHING').bind(slot,packet.iv,marker,size,capacity)
    : db.prepare('UPDATE browser_sync SET version=?, iv=?, write_id=? WHERE slot=? AND version=? AND iv IS NOT NULL AND ? <= '+existing+'+MAX(0,?-'+available+')').bind(packet.version,packet.iv,marker,slot,packet.version-1,size,slot,capacity);
  const guard='EXISTS (SELECT 1 FROM browser_sync WHERE slot=? AND write_id=?)';
  const statements=[write,db.prepare('DELETE FROM browser_sync_chunks WHERE slot=? AND '+guard).bind(slot,slot,marker)];
  const chunk=750000;
  for(let start=0;start<packet.ciphertext.length;start+=chunk) {
    statements.push(db.prepare('INSERT INTO browser_sync_chunks SELECT ?,?,? WHERE '+guard)
      .bind(slot,start/chunk,packet.ciphertext.slice(start,start+chunk),slot,marker));
  }
  const [saved]=await db.batch(statements);
  if (saved!.meta.changes) return c.body(null,204);
  const budget = await db.prepare('SELECT '+available+' AS total, '+existing+' AS previous').bind(slot).first<{total:number;previous:number}>();
  if (budget && size > budget.previous + Math.max(0,capacity-budget.total)) {
    console.warn('sync_capacity_reached');
    return c.body(null,507);
  }
  return c.body(null,409);
});

route.delete('/',async c => {
  const db=c.env.DB, slot=c.get('slot');
  if (!await checkRateLimit(db,'browser-delete:'+c.get('peer'),32,86400)) return c.body(null,429);
  const known = await db.prepare('SELECT 1 FROM browser_sync WHERE slot=?').bind(slot).first();
  if (!known && !await checkRateLimit(db,'sync-new-tombstone',256,86400)) return c.body(null,429);
  await db.batch([
    db.prepare('INSERT INTO browser_sync VALUES(?,1,NULL,?) ON CONFLICT(slot) DO UPDATE SET iv=NULL,version=version+1 WHERE iv IS NOT NULL').bind(slot,crypto.randomUUID()),
    db.prepare('DELETE FROM browser_sync_chunks WHERE slot=?').bind(slot)
  ]);
  return c.body(null,204);
});

export default route;
