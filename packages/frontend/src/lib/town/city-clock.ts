export type ArrivalPhase = 'day' | 'dawn' | 'dusk' | 'night';

export function localHour(date = new Date()) {
  return date.getHours() + date.getMinutes()/60 + date.getSeconds()/3600;
}

export function studioHour(value: string | null) {
  if (!value || !/^(?:[01]?\d|2[0-3])(?::[0-5]\d)?$/.test(value)) return undefined;
  const [hour, minute] = value.split(':').map(Number);
  return hour! + (minute ?? 0)/60;
}

function smooth(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t*t*(3-2*t);
}

const occupancy = [
  [0,.26,.09], [3,.08,.03], [5,.11,.09], [7,.35,.55], [9,.14,.65],
  [12,.10,.55], [16,.23,.57], [18,.49,.43], [20,.65,.29], [22,.53,.16], [24,.26,.09]
] as const;

export function lightAt(hour: number) {
  const h = ((hour%24)+24)%24;
  const daylight = smooth((h-5)/2) * (1-smooth((h-18)/2));
  const twilight = 4*daylight*(1-daylight);
  const index = occupancy.findIndex(point => point[0]>h);
  const a=occupancy[index-1]!, b=occupancy[index]!;
  const t=smooth((h-a[0])/(b[0]-a[0]));
  const phase: ArrivalPhase = h<5 || h>=20 ? 'night' : h<7 ? 'dawn' : h<18 ? 'day' : 'dusk';
  return {daylight,twilight,phase,roomPhase:h/24,bearingOffset:Math.sin((h-12)*Math.PI/12),solarHeight:Math.max(0,Math.cos((h-12)*Math.PI/14)),
    residential:a[1]+(b[1]-a[1])*t, workplace:a[2]+(b[2]-a[2])*t};
}

export type CityLight = ReturnType<typeof lightAt>;

export function roomGlow(seed:number,workplace:boolean,light:CityLight){
  const distance=2*Math.abs(((seed+light.roomPhase)%1)-.5);
  return smooth(((workplace?light.workplace:light.residential)-distance+.009)/.018);
}

export function meteorClock(random = Math.random) {
  const interval=()=>120+180*random();
  let wait=interval(), age=-1;
  return (dt:number,night:boolean,moving:boolean,skyInView=true) => {
    if (!moving || !night) {age=-1;return age;}
    wait=Math.max(0,wait-dt);
    if(wait===0 && skyInView){age=0;wait=interval();}
    else if(age>=0){age+=dt;if(age>1.1)age=-1;}
    return age;
  };
}
