import { hashPage, type CityPage } from './city-growth.js';
import { siteDistrict, siteName, type Architecture } from './architecture-catalog.js';
import type { Coast, Site } from './painted-coast.js';

import type { BodyBuild } from './resident-builds.js';

export type Gesture = 'read'|'bag'|'greet';
export type Errand = {task:string; journey:string; gesture:Gesture};
export type Destination = {kinds:readonly Architecture[]; errand:Errand; memory?:string};
export type ResidentLife = {
  family?:string; build?:BodyBuild; chapter?:number;
  name:string; title:string; paragraphs:string[]; notes:readonly string[]; heading:string;
  anchor:Errand; destinations:Destination[]; atHome:Errand; corner:Errand;
  lunch:string; shift:number; tint:number; tomas:boolean;
};
export type ResidentHome = {resident:string; site:Site; arrival:number; life:ResidentLife};
export type ResidentVisit = {life:ResidentLife; task:string; stops:string[]; memory?:string; site?:Site};
const errand=(task:string,journey:string,gesture:Gesture):Errand=>({task,journey,gesture});
const stop=(kinds:Architecture[],task:string,journey:string,gesture:Gesture,memory?:string):Destination=>({kinds,errand:errand(task,journey,gesture),memory});

const recipeNotes = [
    'Sunday. Tried it on Nell. She took the pot home, so I had toast.',
    'Monday. First attempt in the small pot. Enough left over for the entire night watch.',
    'Tuesday. Nell measured my “little handful.” Six spoonfuls. We have agreed on two.',
    'Wednesday. Mum wrote “until the windows steam.” Nell cooks with the window open.',
    'Thursday. The heel of yesterday’s loaf holds together better than a fresh slice.',
    'Friday. I finally remembered the lemon. It went in after we cut the engine.',
    'Saturday. Wrote “serves two” in ink. Left some room underneath.'
  ];

export const tomas:ResidentLife={
  name:'Tomás Vale',title:'Soup for two',heading:'From his recipe book',notes:recipeNotes,
  paragraphs:[
    "At sixteen, Tomás Vale washed pots on the morning ferry. One December the cook missed the boat. Tomás made his mother’s bean soup, and by the return crossing he had a new job. For thirty years he fed the crew from a pot bolted to the stove.",
    "When his daughter Nell moved into her first flat, she rang for the recipe. “Start with twelve onions,” he said. She laughed so hard he could hear her put the phone down.",
    "Now he’s working it out in her little blue saucepan. He keeps a folded recipe card in his market bag. When he gets the quantities right, he wants to give Nell a book in his own handwriting, grease spots and all."
  ],
  anchor:errand('Choosing vegetables','Off to the market','bag'),
  destinations:[
    stop(['bakery'],'Asking for yesterday’s loaf','Calling at the bakery','greet'),
    stop(['wharf'],'Waving to the ferry crew','Down to the landing','greet'),
    stop(['bindery'],'Checking the recipe proofs','Taking his pages to the bindery','read')
  ],
  atHome:errand('Checking Nell’s shopping list','Heading home with supper','read'),
  corner:errand('Reading a note from Nell','Finding a quiet spot','read'),
  lunch:'Trying the soup in Nell’s saucepan',shift:0,tint:0xffffff,tomas:true
};

const projects = {
  seeds:{
    title:'The envelope garden', origins:['A tin of seeds arrived with three labels washed clean in the rain.','A single marigold came up in a cracked teacup the year the garden failed.'],
    turningPoint:(relative:string)=>'The last flowers sent to '+relative+' arrived as dust. Seeds ought to survive the post.',
    aim:'raise enough flowers to give away a paper envelope of seeds with every birthday card',
    task:'Sorting seed envelopes', gesture:'bag', notes:['The smallest envelope held the tallest plant.','Save the heads that rattle.','Leave one flower for the bees.'],
    stops:[stop(['glasshouse','orangery'],'Comparing seedlings','Taking the first shoots under glass','bag','a cutting took root in a jam jar. It now has three leaves and a name on a paper tag.'),stop(['market','tearoom'],'Giving away seed packets','Delivering seed packets','greet','the first packet came back empty with a drawing of the flower that grew.'),stop(['library','bindery'],'Looking up a plant name','Taking a leaf to be identified','read','somebody recognized the leaf by its smell before the notebook was even open.')]
  },
  atlas:{
    title:'The map you can hear', origins:['An old street map hung upside down over the kitchen table for years. Nobody ever turned it round.','On the walk to school, every turning had a different sound. The shortest way was the dullest.'],
    turningPoint:(relative:string)=>'It started as a game with '+relative+'. Could either of them give directions without using a single street name?',
    aim:'draw a map that can be followed by ear, with a little story at every turning',
    task:'Marking a sound on the map', gesture:'read', notes:['Draw the echo under the arch twice.','Who whistles the same four notes every morning?','Paper folds better along a street than through a house.'],
    stops:[stop(['musicHall','belfry','station'],'Timing the echoes','Listening for a familiar sound','read','one clear note lasts just long enough to walk to the end of the rail. It gets a long blue line on the map.'),stop(['wharf','boathouse'],'Asking about the fog signal','Walking down to hear the water','greet','the sound of water under the planks made it onto the map as a row of little commas.'),stop(['library','bindery','postOffice'],'Comparing pencilled street names','Carrying a new map sheet','read','two neighbors gave the same turning different names. Both names went on the map.')]
  },
  mending:{
    title:'The drawer of spare parts', origins:['The first thing that ever came apart was a wind-up bird. Getting its wings back on took most of a winter.','As a child, a broken latch meant a whole afternoon at the workbench with a file and a stub of candle.'],
    turningPoint:(relative:string)=>'Then '+relative+' spent a whole Sunday looking for a screw that would hold a cupboard door. There were six just like it at home.',
    aim:'make a lending box of small things that are always missing when something breaks',
    task:'Sorting the little brass fittings',gesture:'bag',notes:['Two left hinges. Someone must have the right ones.','A button tin makes a fine parts drawer.','Ask for the story as well as the broken piece.'],
    stops:[stop(['cooperage','clockmaker','warehouse','sailLoft'],'Matching a worn fitting','Taking a part to the workshop','bag','a neighbor traced a missing latch on the back of a receipt. The drawing still lives in the parts box.'),stop(['market','pottery'],'Asking who needs a repair','Looking for the owner of a broken handle','greet','a handle found its owner because both halves had the same daub of green paint.'),stop(['wharf','boathouse'],'Returning a borrowed tool','Carrying a tool back to the landing','bag','a borrowed spanner came home wrapped in a clean handkerchief. Now every loan goes out that way.')]
  },
  table:{
    title:'One more chair',origins:['At family dinners the table grew longer by balancing a door on two crates.','The good tablecloth still has a small blue darn where a birthday candle fell over.'],
    turningPoint:(relative:string)=>'It was '+relative+' who first suggested putting a table out in the street. By teatime two people had offered to bring chairs.',
    aim:'put on a neighborhood supper where every guest brings a dish and the story of who taught them',
    task:'Counting places for supper',gesture:'read',notes:['Borrow one more chair. Someone always brings a friend.','Write the names on the backs of the recipes.','Keep the chipped bowl for the cook.'],
    stops:[stop(['bakery','market'],'Collecting the bread order','Going out for supper supplies','bag','a neighbor offered the heels of the day’s loaves. The supper menu grew a bread pudding.'),stop(['tearoom','pottery'],'Borrowing a serving bowl','Calling for an extra bowl','greet','the best offer so far has been a chipped blue bowl big enough for everybody.'),stop(['postOffice','library','bindery'],'Handing over an invitation','Delivering a supper invitation','read','someone wrote “plus my sister” on the first invitation. There is a spare chair on the list now.')]
  },
  archive:{
    title:'Names on the backs',origins:['A box of old photographs turned up with the move. All the dates were there, but hardly any names.','There was a face in every family album nobody could place, until someone recognized the dog.'],
    turningPoint:(relative:string)=>'A print sent to '+relative+' came back with an arrow in the margin and three words in pencil. “That’s our mum.”',
    aim:'write down the names on the backs of the photographs while there are still neighbors who remember',
    task:'Sorting the photographs',gesture:'read',notes:['The little one with the bucket is somebody’s grandfather.','Leave a soft pencil in the packet.','Ask who stood behind the camera.'],
    stops:[stop(['library','bindery','atelier'],'Comparing two old photographs','Taking the album out for a second opinion','read','a thumbprint on a photograph turned out to be a tiny dog asleep under a chair. That was enough to identify the family.'),stop(['tearoom','market','civic'],'Asking a neighbor about a face','Meeting someone who remembers','greet','a neighbor remembered a tune before remembering the name. Both went on the back of the photograph.'),stop(['postOffice','station','wharf'],'Handing over a copy for the family','Carrying a photograph to send on','bag','a copy of a wedding photograph began its trip back to the child standing at the edge of the frame.')]
  }
} as const;
type Project=keyof typeof projects;
const choices:Record<ReturnType<typeof siteDistrict>,Project[]>={
  residential:['archive','table','mending','atlas','seeds'],gardens:['seeds','atlas'],works:['mending','archive'],
  exchange:['table','mending','seeds'],civic:['atlas','archive']
};
const given=['Ada','Iona','Jun','Luz','Nico','Mara','Idris','Esme','Oren','Ravi','Alba','Kit','Inés','Remy','Pia','Ellis','Ren','Noor','Leila','Finn'];
const family=['Alder','Costa','Bell','Reed','Mori','Linden','Silva','Chen','Perry','Dale','Navarro','Green','Hart','Shaw','West','Finch','Sato','Rios','Park','Cole'];

function lifeAt(site:Site,neighbors:readonly ResidentLife[]):ResidentLife {
  const pick=<T>(options:readonly T[],key:string)=>options[hashPage(site.id+'/'+key)%options.length]!;
  const first=pick(given,'first'), surname=hashPage(site.id+'/family');
  let name=first+' '+family[surname%family.length];
  for(let n=1;neighbors.some(life=>life.name===name);n++)name=first+' '+family[(surname+n)%family.length];
  const candidates=choices[siteDistrict(site.kind)];
  const unclaimed=candidates.filter(key=>neighbors.every(life=>life.title!==projects[key].title));
  const project=projects[pick(unclaimed.length?unclaimed:candidates,'project')];
  const relative=pick(['an older sister','a childhood friend','a cousin who moved away','a former neighbor'],'dedication');
  const place=siteName(site.kind).replace(/^The /,'the ');
  const keepsake=pick(['a biscuit tin lined with folded newspaper','a canvas bag with a handle repaired in blue thread','a wooden box with initials scratched under the lid','a bundle of letters tied with yellow string'],'keepsake');
  const notes=[...project.notes];
  const offset=hashPage(site.id+'/notes')%notes.length;
  return {name,title:project.title,heading:'From the pocket notebook',tomas:false,
    paragraphs:[pick(project.origins,'memory')+' '+project.turningPoint(relative),first+' keeps '+keepsake+'. The plan is to '+project.aim+'.'],
    notes:notes.slice(offset).concat(notes.slice(0,offset)),anchor:errand(project.task,'Heading to '+place,project.gesture),
    destinations:[...project.stops],atHome:errand('Putting away the day’s work','Heading home','bag'),
    corner:errand('Making a note for tomorrow','Taking a notebook out for a walk','read'),
    lunch:'At home for lunch',shift:pick([-.75,-.5,0,.5,.75],'hours'),
    tint:pick([0xffdbac,0xb9d8ff,0xe9bfe0,0xb1d299,0xffb5a2,0xd5c0ff],'sweater')};
}

export function residentHomes(coast:Coast,pages:readonly Pick<CityPage,'id'|'created_at'>[],example=false):ResidentHome[]{
  const dates=new Map(pages.map(p=>[p.id,p.created_at]));
  const eligible=coast.sites.filter(s=>!s.quiet && s.kind!=='pines' && dates.has(s.readableId??s.id));
  const hosts=example?eligible.filter(site=>site.kind==='market').slice(0,1):eligible.slice(0,2);
  const neighbors:ResidentLife[]=[];
  return hosts.map((site,index)=>{
    const life=example?tomas:lifeAt(site,neighbors);
    neighbors.push(life);
    return {site,life,resident:example?'shopper':site.id,
      arrival:dates.get(site.readableId??site.id)!+(index===0?600:1800)};
  });
}
