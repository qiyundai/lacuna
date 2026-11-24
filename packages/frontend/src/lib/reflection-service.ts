import { availability } from './availability.svelte.js';
import { aiAvailable } from './ai-release.js';
import { reflectionNoticeVersion } from '../../../shared/terms.js';
import { emptyBook, nextBookTask, acceptBookResult } from '../../../shared/living-book.js';
import { browserVault, type WebVault } from './web-vault.js';

export type Account = {id:string;email:string;paid:boolean;customer:boolean;consent:number;paidUntil:number;billingState:string;annualAvailable:boolean};
let backgroundMessage='';
export function reflectionStatus(){return backgroundMessage;}
function report(message:string){
  if(message===backgroundMessage)return;
  backgroundMessage=message;window.dispatchEvent(new Event('lacuna:reflection-status'));
}
export async function hosted<T>(action:string,body?:unknown,signal?:AbortSignal):Promise<T> {
  const requiresAdultJournal = action==='generate' || action==='checkout' ||
    (action==='consent' && (body as {enabled?:boolean})?.enabled === true);
  if (requiresAdultJournal) {
    if (!aiAvailable) throw new Error('Reflections is coming soon. Checkout is closed.');
    if (browserVault().deviceOnly) throw new Error('This journal stays on this device.');
    if (!availability.confirmedOnline) throw new Error('Online journal features require a verified connection in the United States or Canada outside Québec.');
  }
  const response=await fetch('/reflections/'+action,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal,
    headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if (!response.ok) {
    const data=await response.json().catch(()=>null);
    throw Object.assign(new Error(typeof data?.error==='string'?data.error:response.status===401?'Sign in to Lacuna.':'Hosted reflections are unavailable.'),{status:response.status,code:data?.code,retryAt:data?.retryAt});
  }
  return response.json();
}
export async function processBookUnit(vault: WebVault, signal:AbortSignal,call:typeof hosted=hosted,update:(message:string)=>void=()=>{}) {
  if (!vault.unlocked || vault.deviceOnly) return false;
  const journal=vault.read(), consent=journal.reflectionConsent, generation=vault.sessionGeneration;
  if (consent?.noticeVersion!==reflectionNoticeVersion || !await vault.current()) return false;
  const task=nextBookTask(journal.book??emptyBook(),journal.entries);
  if(!task){
    const hasPassage=journal.book?.chapters.some(chapter=>chapter.passages.some(p=>p.prose));
    update(hasPassage?'Your saved memoir is up to date. New pages can add another passage.':journal.entries.length?'Waiting for more source material. A first passage needs at least three pages with details across two writing days.':'Write your first page to start reflections.');
    return false;
  }
  const allowed=(account:Account)=>account.id===consent.account && account.paid && account.consent===consent.epoch && account.consent%2===1;
  const current=()=>!signal.aborted && generation===vault.sessionGeneration && vault.unlocked && vault.read().revision===journal.revision;
  if (!allowed(await call<Account>('account',undefined,signal))){
    if(current())update('Reflections are paused. Check your subscription and journal permission.');
    return false;
  }
  if(!current() || !await vault.current())return false;
  const stamp=JSON.stringify([journal.revision,consent,task.kind,task.primary]);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stamp));
  const unit=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(!current())return false;
  update(task.kind==='observe'?'Reading a journal page…':'Writing a memoir passage…');
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
    if(disposed || controller)return;
    if(!vault.unlocked){report('Unlock this journal to resume reflections.');return;}
    if(!navigator.onLine){report('Offline. Reflections resume when you reconnect.');return;}
    if(!vault.sharingAllowed){report('');return;}
    controller=new AbortController();
    let delay=0;
    try {
      const signal=controller.signal;
      const unit=()=>processBookUnit(vault,signal,hosted,report);
      const more=navigator.locks?await navigator.locks.request('lacuna-memoir',{ifAvailable:true},lock=>{
        if(lock)return unit();
        report('Reflections are running in another tab.');delay=2000;return false;
      }):await unit();
      if(more)delay=180;
    }catch(e){
      if(!controller.signal.aborted){
        const failure=e as {status?:number;code?:string;retryAt?:number;message?:string};
        if(failure.status===429 && failure.retryAt && failure.message){
          delay=Math.max(1000,failure.retryAt-Date.now());
          const reset=new Date(failure.retryAt).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
          report(failure.message+(failure.code==='unit_busy'?'':` Next scheduled attempt: ${reset} (UTC).`));
        }else{
          report(!navigator.onLine?'Offline. Reflections resume when you reconnect.':failure.status===401?'Sign in again to continue reflections.':failure.status===403?'Reflections paused. Check billing and journal permission.':'Reflections are temporarily unavailable. Your saved book is available. Lacuna will try again.');
          delay=60000;
        }
      }
    }
    finally{controller=undefined;if(!disposed && (delay || dirty)){dirty=false;clearTimeout(timer);timer=setTimeout(run,Math.min(delay||300,2147483647));}}
  }
  function wake(){
    if(!vault.unlocked || !navigator.onLine || !vault.sharingAllowed)controller?.abort();
    if(controller){dirty=true;return;}
    clearTimeout(timer);timer=setTimeout(run,300);
  }
  const stop=()=>controller?.abort();
  window.addEventListener('lacuna:journal-changed',wake);
  window.addEventListener('online',wake);
  window.addEventListener('offline',wake);
  window.addEventListener('lacuna:reflection-retry',wake);
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',wake);
  wake();
  return ()=>{disposed=true;clearTimeout(timer);stop();window.removeEventListener('lacuna:journal-changed',wake);window.removeEventListener('online',wake);window.removeEventListener('offline',wake);window.removeEventListener('lacuna:reflection-retry',wake);window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',wake);};
}
