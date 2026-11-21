import { emptyBook, nextBookTask, acceptBookResult } from '../../../shared/living-book.js';
import { browserVault, type WebVault } from './web-vault.js';

export type Account = {id:string;email:string;paid:boolean;customer:boolean;consent:number};
let backgroundMessage='';
export function reflectionStatus(){return backgroundMessage;}
function report(message:string){
  if(message===backgroundMessage)return;
  backgroundMessage=message;window.dispatchEvent(new Event('lacuna:reflection-status'));
}
export async function hosted<T>(action:string,body?:unknown,signal?:AbortSignal):Promise<T> {
  const response=await fetch('/reflections/'+action,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal,
    headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if (!response.ok) {
    const data=await response.json().catch(()=>null);
    throw Object.assign(new Error(typeof data?.error==='string'?data.error:response.status===401?'Sign in to Lacuna.':'Hosted reflections are unavailable.'),{status:response.status});
  }
  return response.json();
}
export async function processBookUnit(vault: WebVault, signal:AbortSignal,call:typeof hosted=hosted) {
  if (!vault.unlocked) return false;
  const journal=vault.read(), consent=journal.reflectionConsent, generation=vault.sessionGeneration;
  if (!consent || !await vault.current()) return false;
  const task=nextBookTask(journal.book??emptyBook(),journal.entries);
  if(!task)return false;
  const allowed=(account:Account)=>account.id===consent.account && account.paid && account.consent===consent.epoch && account.consent%2===1;
  const current=()=>!signal.aborted && generation===vault.sessionGeneration && vault.unlocked && vault.read().revision===journal.revision;
  if (!allowed(await call<Account>('account',undefined,signal)) || !current() || !await vault.current()) return false;
  const stamp=JSON.stringify([journal.revision,consent,task.kind,task.primary]);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stamp));
  const unit=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(!current())return false;
  const {result}=await call<{result:unknown}>('generate',{unit,kind:task.kind,primary:task.primary,evidence:task.evidence,consent:consent.epoch,account:consent.account},signal);
  if(!current() || !allowed(await call<Account>('account',undefined,signal)) || !current())return false;
  await vault.update(data=>{
    if (signal.aborted || generation!==vault.sessionGeneration || data.revision!==journal.revision || data.reflectionConsent?.epoch!==consent.epoch || data.reflectionConsent.account!==consent.account) throw new Error('The journal changed.');
    data.book??=emptyBook();acceptBookResult(data.book,data.entries,task,result);
  });
  return true;
}
export function backgroundBook() {
  const vault=browserVault();
  let timer:ReturnType<typeof setTimeout>, controller:AbortController|undefined, disposed=false, dirty=false;
  async function run(){
    if(disposed || controller || !vault.unlocked || !navigator.onLine)return;
    controller=new AbortController();
    let delay=0;
    try {
      const signal=controller.signal;
      const unit=()=>processBookUnit(vault,signal);
      const more=navigator.locks?await navigator.locks.request('lacuna-memoir',{ifAvailable:true},lock=>{
        if(lock)return unit();
        delay=2000;return false;
      }):await unit();
      if(more)delay=180;
      report('');
    }catch(e){
      if(!controller.signal.aborted){
        const status=(e as {status?:number}).status;
        report(status===429?'Reflections are waiting for available allowance.':status===401?'Sign in again to continue reflections.':'Reflections paused. Your saved book is available.');
        delay=status===429?120000:60000;
      }
    }
    finally{controller=undefined;if(!disposed && (delay || dirty)){dirty=false;clearTimeout(timer);timer=setTimeout(run,delay||300);}}
  }
  function wake(){
    if(!vault.unlocked)controller?.abort();
    if(controller){dirty=true;return;}
    clearTimeout(timer);timer=setTimeout(run,300);
  }
  const stop=()=>controller?.abort();
  window.addEventListener('lacuna:journal-changed',wake);
  window.addEventListener('online',wake);
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',wake);
  wake();
  return ()=>{disposed=true;clearTimeout(timer);stop();window.removeEventListener('lacuna:journal-changed',wake);window.removeEventListener('online',wake);window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',wake);};
}
