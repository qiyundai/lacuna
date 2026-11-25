export const currentRiverEdition = 5 as const;
export type CityPage = { id:string; created_at:number; writingDay?:number; riverEdition?:2|3|4|5 };
export type ForgottenAddress = CityPage & { position:number; forgottenAfter:number };

export function forgetAddress(entries:readonly CityPage[],forgotten:readonly ForgottenAddress[],index:number):ForgottenAddress {
  const {id,created_at,riverEdition,writingDay}=entries[index]!;
  let position=index;
  for(const address of forgotten)if(address.position<=position)position++;
  return {id,created_at,...(writingDay!==undefined && writingDay!==Math.floor(created_at/86400) && {writingDay}),...(riverEdition && {riverEdition}),position,forgottenAfter:entries.length+forgotten.length};
}

export function citySequence(entries:readonly CityPage[],forgotten:readonly ForgottenAddress[]):CityPage[]{
  if(!forgotten.length)return [...entries];
  let entryIndex=0,addressIndex=0;
  return Array.from({length:entries.length+forgotten.length},(_,position)=>{
    const address=forgotten[addressIndex];
    if(address?.position===position){
      addressIndex++;
      return address;
    }
    return entries[entryIndex++]!;
  });
}

export function forgetPageAt<T extends CityPage>(journal:{entries:T[];forgotten?:ForgottenAddress[]},index:number){
  const forgotten=journal.forgotten??[];
  const address=forgetAddress(journal.entries,forgotten,index);
  journal.forgotten=[...forgotten,address].sort((a,b)=>a.position-b.position);
  journal.entries.splice(index,1);
  return address;
}

export function validCityHistory(entries:readonly CityPage[],addresses?:ForgottenAddress[]){
  if(addresses===undefined)return true;
  if(!Array.isArray(addresses))return false;
  const ids=new Set(entries.map(e=>e.id)),length=entries.length+addresses.length;
  let previous=-1;
  return addresses.every(a=>{
    if(!a || typeof a.id!=='string' || !/^[a-f0-9]{32}$/.test(a.id) || ids.has(a.id) ||
      !Number.isSafeInteger(a.created_at) || a.created_at<0 ||
      (a.writingDay!==undefined && (!Number.isSafeInteger(a.writingDay) || Math.abs(a.writingDay-Math.floor(a.created_at/86400))>1)) ||
      (a.riverEdition!==undefined && a.riverEdition!==2 && a.riverEdition!==3 && a.riverEdition!==4 && a.riverEdition!==5) ||
      !Number.isSafeInteger(a.position) || a.position<=previous || !Number.isSafeInteger(a.forgottenAfter) ||
      a.forgottenAfter<=a.position || a.forgottenAfter>length ||
      Object.keys(a).some(k=>!['id','created_at','writingDay','riverEdition','position','forgottenAfter'].includes(k)))return false;
    previous=a.position;ids.add(a.id);return true;
  });
}
