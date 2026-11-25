import { availability } from './availability.svelte.js';
import { validPacket, syncLimit, type SyncPacket } from '../../../shared/sync-packet.js';
import { apiBase } from './api.js';
import { base64, bytes, browserVault, announceBrowserLock, forgetWebPage, type WebVault, type WebEnvelope, type WebJournal } from './web-vault.js';

import { emptyCensus, settleCity } from './town/citizens.js';

const utf8=new TextEncoder();
export const pairingCode=(secret:Uint8Array)=>base64(secret).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export const newPairingCode=()=>pairingCode(crypto.getRandomValues(new Uint8Array(32)));
export function pairingSecret(code:string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new Error('Paste the full pairing code from your other device.');
  return bytes(code.replaceAll('-','+').replaceAll('_','/'));
}

async function credentials(code:string) {
  const root=await crypto.subtle.importKey('raw',pairingSecret(code),'HKDF',false,['deriveKey','deriveBits']);
  const derive=(purpose:string)=>({name:'HKDF',hash:'SHA-256',salt:utf8.encode('lacuna.browser-sync.v1'),info:utf8.encode(purpose)});
  const key=await crypto.subtle.deriveKey(derive('encrypted snapshot'),root,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const auth=new Uint8Array(await crypto.subtle.deriveBits(derive('storage access'),root,256));
  return {key,token:Array.from(auth,b=>b.toString(16).padStart(2,'0')).join('')};
}
function cipher(iv:Uint8Array<ArrayBuffer>,version:number) {
  return {name:'AES-GCM',iv,additionalData:utf8.encode('lacuna.browser-sync.v1:'+version)};
}
async function decrypt(packet:SyncPacket,key:CryptoKey):Promise<WebEnvelope> {
  if (!validPacket(packet)) throw new Error('The online copy is damaged. Your local copy is safe.');
  const plaintext=await crypto.subtle.decrypt(cipher(bytes(packet.iv),packet.version),key,bytes(packet.ciphertext));
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));
}
type Transport=typeof fetch;
function request(send:Transport,token:string,method:string,body?:SyncPacket,known?:number,signal?:AbortSignal) {
  return send(apiBase+'/journal-sync',{method,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),
    headers:{Authorization:'Bearer '+token,...(known===undefined?{}:{'If-None-Match':'"'+known+'"'}),...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined});
}
function requireSuccess(response:Response) {
  if (response.ok) return;
  if (response.status===410) throw new Error('The online copy was deleted. Your local journal is safe.');
  if (response.status===404) throw new Error('No online journal was found for this pairing code.');
  if (response.status===507) throw new Error('Online storage is full. Your local journal is safe. Download an encrypted backup.');
  if (response.status===429) throw new Error('Sync is taking a break. Your pages are saved here. Try again later.');
  if (response.status===409) throw new Error('Another device just saved. Retry sync to pick up its changes.');
  throw new Error('Could not reach encrypted storage. Your local journal is safe.');
}

export async function linkDevice(vault:WebVault,code:string,passphrase:string,send:Transport=fetch,passkey=false) {
  if (vault.unlocked) throw new Error('Lock your journal before linking a device.');
  const generation=vault.sessionGeneration;
  const {key,token}=await credentials(code);
  const response=await request(send,token,'GET');
  requireSuccess(response);
  const packet:SyncPacket=await response.json();
  const envelope=await decrypt(packet,key);
  if (vault.sessionGeneration!==generation || vault.unlocked) throw new Error('Lock your journal before linking a device.');
  await vault.restore(envelope,passphrase,{code,version:packet.version,...(passkey?{passkey:true}:{})});
  announceBrowserLock();
}

export async function removeOnline(vault:WebVault,send:Transport=fetch) {
  const pairing=vault.pairing;
  if (!pairing) return;
  const {token}=await credentials(pairing.code);
  requireSuccess(await request(send,token,'DELETE'));
  await vault.setPairing(pairing,undefined);
}


function journalContent(data:WebJournal) {
  const {deviceSync,reflectionConsent,acceptedTerms,revision,...journal}=data;
  return journal;
}
function combineNewPages(local:WebJournal,cloud:WebJournal,baseCount:number) {
  const {entries:left,census:localCast,...a}=journalContent(local),{entries:right,census:cloudCast,...b}=journalContent(cloud);
  if (left.length<baseCount || right.length<baseCount || JSON.stringify(a)!==JSON.stringify(b)) return;
  if (left.slice(0,baseCount).some((entry,i)=>JSON.stringify(entry)!==JSON.stringify(right[i]))) return;
  const existing=new Map(right.map(entry=>[entry.id,entry]));
  const additions=left.slice(baseCount);
  if (additions.some(entry=>existing.has(entry.id) && JSON.stringify(existing.get(entry.id))!==JSON.stringify(entry))) return;
  const extra=additions.filter(entry=>!existing.has(entry.id));
  const entries=[...right,...extra];
  const census=structuredClone(cloudCast??emptyCensus());
  const people=new Map(census.people.map(p=>[p.id,p]));
  for(const p of localCast?.people??[]){
    const same=people.get(p.id);
    if(!same)people.set(p.id,p);
    else if(p.chapters.length>same.chapters.length)people.set(p.id,{...same,chapters:p.chapters,places:p.places,neighbor:p.neighbor??same.neighbor,next:p.next});
  }
  census.serial=Math.max(census.serial,localCast?.serial??0);
  census.people=[...people.values()];
  const previous=localCast || cloudCast ? census : undefined;
  const merged=settleCity(entries,cloud.forgotten??[],previous,Math.floor(Date.now()/1000));
  if(!extra.length && JSON.stringify(merged)===JSON.stringify(cloudCast))return cloud;
  return {...cloud,revision:Math.max(local.revision,cloud.revision)+1,entries,census:merged};
}
export class SyncConflict extends Error {}
function preserveForgottenPages(journal:WebJournal,local:WebJournal) {
  if (!local.forgotten?.length) return;
  const forgotten=new Set(local.forgotten.map(address=>address.id));
  const before=journal.forgotten?.length??0;
  for(let i=journal.entries.length-1;i>=0;i--) {
    if (forgotten.has(journal.entries[i]!.id)) forgetWebPage(journal,i);
  }
  const addresses=journal.forgotten??=[];
  const recorded=new Set(addresses.map(address=>address.id));
  for(const address of local.forgotten) {
    if (recorded.has(address.id)) continue;
    const position=journal.entries.length+addresses.length;
    addresses.push({...address,position,forgottenAfter:position+1});
  }
  if (addresses.length>before) journal.revision=Math.max(local.revision,journal.revision)+1;
}
export async function syncJournal(vault:WebVault,send:Transport=fetch,acceptCloud=false,signal?:AbortSignal) {
  const pairing=vault.pairing;
  if (vault.deviceOnly || !pairing?.enabled) return;
  const generation=vault.sessionGeneration;
  const {token,key}=await credentials(pairing.code);
  const active=()=>!signal?.aborted && generation===vault.sessionGeneration && JSON.stringify(vault.pairing)===JSON.stringify(pairing);
  if (!active()) return;
  const response=await request(send,token,'GET',undefined,pairing.version,signal);
  if (!active()) return;
  if (response.status===410) {
    await vault.setPairing(pairing,undefined);
    requireSuccess(response);
  }
  if (response.status!==304 && !(response.status===404 && pairing.version===0)) {
    requireSuccess(response);
    const packet:SyncPacket=await response.json();
    if (!validPacket(packet) || packet.version<=pairing.version) throw new Error('The online version could not be verified.');
    const cloud=await vault.readSynced(await decrypt(packet,key));
    if (!active()) return;
    const local=vault.read(),diverged=local.revision!==pairing.syncedRevision;
    let data=cloud;
    if (diverged && !acceptCloud && JSON.stringify(journalContent(cloud))!==JSON.stringify(journalContent(local))) {
      const combined=combineNewPages(local,cloud,pairing.syncedPages);
      if (!combined) throw new SyncConflict('Both copies changed offline. Keep an encrypted copy of this device and continue from the online journal.');
      data=combined;
    }
    const checkpoint={...pairing,version:packet.version,syncedRevision:cloud.revision,syncedPages:cloud.entries.length};
    preserveForgottenPages(data,local);
    await vault.setPairing(pairing,checkpoint,
      {data,expectedRevision:local.revision,backup:diverged && acceptCloud});
    return;
  }
  const revision=vault.syncRevision,pages=vault.pageCount;
  if (revision===pairing.syncedRevision) return;
  const envelope=await vault.backup();
  const iv=crypto.getRandomValues(new Uint8Array(12)),version=pairing.version+1;
  const ciphertext=base64(new Uint8Array(await crypto.subtle.encrypt(cipher(iv,version),key,utf8.encode(JSON.stringify(envelope)))));
  if (ciphertext.length>syncLimit) throw new Error('This journal exceeds the online size limit. Download an encrypted backup in Privacy & storage.');
  if (!await vault.current() || !active() || revision!==vault.syncRevision) return;
  const written=await request(send,token,'PUT',{version,iv:base64(iv),ciphertext},undefined,signal);
  requireSuccess(written);
  if (active()) await vault.setPairing(pairing,{...pairing,version,syncedRevision:revision,syncedPages:pages});
}

let pending:Promise<void>|undefined;
let controller:AbortController|undefined;
export let syncMessage='';
export let hasConflict=false;
export function runBrowserSync(acceptCloud=false):Promise<void> {
  if (!availability.confirmedOnline) return Promise.resolve();
  if (pending) return acceptCloud?pending.then(()=>runBrowserSync(true)):pending;
  controller=new AbortController();
  pending=syncJournal(browserVault(),fetch,acceptCloud,controller.signal).then(()=>{
    syncMessage='';hasConflict=false;
  },error=>{
    if (controller?.signal.aborted) return;
    syncMessage=error instanceof Error?error.message:'Sync is waiting for a connection.';
    hasConflict=error instanceof SyncConflict;
  }).finally(()=>{
    pending=undefined;controller=undefined;
    window.dispatchEvent(new Event('lacuna:sync-status'));
  });
  return pending;
}
export async function pauseSyncWork() {
  controller?.abort();
  await pending;
}
export function watchBrowserSync() {
  const vault=browserVault();
  let timer:ReturnType<typeof setTimeout>;
  function wake() {
    clearTimeout(timer);
    const pairing=vault.pairing;
    if (!pairing?.enabled) {
      controller?.abort();
      return;
    }
    if (!navigator.onLine) return;
    // A hidden tab may be closed or its storage cleared before it is shown again.
    if (document.hidden) {
      if (pairing.syncedRevision!==vault.syncRevision) void runBrowserSync();
      return;
    }
    timer=setTimeout(()=>void runBrowserSync(),600);
  }
  const interval=setInterval(wake,30000);
  window.addEventListener('lacuna:journal-changed',wake);
  window.addEventListener('online',wake);
  document.addEventListener('visibilitychange',wake);
  wake();
  return ()=>{
    clearInterval(interval);clearTimeout(timer);controller?.abort();
    window.removeEventListener('lacuna:journal-changed',wake);
    window.removeEventListener('online',wake);
    document.removeEventListener('visibilitychange',wake);
  };
}
