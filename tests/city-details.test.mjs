import test from 'node:test';
import assert from 'node:assert/strict';
import { excerpts } from './city-scene-excerpts.mjs';
import { recognizeScene } from '../packages/frontend/src/lib/town/journal-scenes.ts';
import { journalDetails } from '../packages/frontend/src/lib/town/journal-details.ts';
import { paintedCoast } from '../packages/frontend/src/lib/town/painted-coast.ts';
import { districtKey } from '../packages/frontend/src/lib/town/river-neighborhoods.ts';
import { forgetPageAt } from '../packages/shared/city-address.ts';
import { hashPage } from '../packages/frontend/src/lib/town/city-growth.ts';

test('scene vocabulary precision and recall on held-out journal excerpts', t => {
  const tally = new Map();
  let recognized=0;
  for (const [label, body] of excerpts) {
    const expected = label.split(' ').filter(Boolean), actual = recognizeScene(body).activities;
    if (actual.length) recognized++;
    if (!expected.length) assert.deepEqual(actual, [], body);
    for (const family of new Set([...expected, ...actual])) {
      const counts = tally.get(family) ?? {hits:0, guesses:0, positives:0};
      counts.guesses += Number(actual.includes(family));
      counts.positives += Number(expected.includes(family));
      counts.hits += Number(actual.includes(family) && expected.includes(family));
      tally.set(family,counts);
    }
  }
  for (const [family,{hits,guesses,positives}] of tally) {
    t.diagnostic(family + ': ' + hits + '/' + guesses + ' correct, ' + hits + '/' + positives + ' positive excerpts recognized');
    assert.ok(hits/guesses >= .9 && hits/positives >= .5, family);
  }
  t.diagnostic(recognized+' of '+excerpts.length+' excerpts received a cue');
});

function year(seed, body) {
  return Array.from({length:365}, (_,i) => ({id:hashPage(seed+'/'+i).toString(16).padStart(32,'0'),created_at:i,riverEdition:3,body}));
}
function plan(journal) {
  const coast=paintedCoast(journal.entries,journal.forgotten);
  return {coast, details:journalDetails(coast,journal.entries)};
}
function residents(details) {
  return new Map([...details.addresses.values()].flat().map(d=>[d.page,d]));
}
test('a year of swims preserves the entire coast and both banks across seeds', () => {
  for (const seed of ['headland','orchard','blue']) {
    const entries=year(seed,'I went swimming'), {coast,details}=plan({entries});
    const neutral=plan({entries:entries.map(e=>({...e,body:'An ordinary day.'}))});
    assert.deepEqual(coast,neutral.coast);
    assert.equal(neutral.details.addresses.size+neutral.details.streets.size,0);
    assert.equal(new Set(coast.sites.map(s=>s.bank)).size,2);
    const decorated=residents(details);
    assert.ok(decorated.size>100 && decorated.size<entries.length);
    assert.ok(new Set([...decorated.values()].map(x=>x.detail)).size>=5);
    for(const group of details.addresses.values())assert.equal(new Set(group.map(x=>x.detail)).size,group.length);
    assert.ok(details.streets.size>0);
    for(const [key,item] of details.streets) {
      const cell=coast.neighborhoods.get(key);
      assert.ok(new Set(cell.anchors).size>=3);
      const bank=cell.anchors[0].bank;
      for(const dc of [-1,0,1])for(const dl of [-1,0,1]) {
        const lane=cell.lane+dl;
        if((dc||dl) && lane>=0 && lane<=3)
          assert.notEqual(details.streets.get(districtKey({column:cell.column+dc,lane,bank})),item);
      }
    }
    assert.deepEqual(plan(structuredClone({entries})).details,details);
    for(const [id,old] of residents(plan({entries:entries.slice(0,190)}).details))
      assert.deepEqual(decorated.get(id),old);
  }
});

test('forgetting removes only the resident furnishing and recounts independent street support', () => {
  const journal={entries:year('quay','We went swimming at sunrise.'), forgotten:[]};
  const before=plan(journal), saved=residents(before.details);
  const shared=[...before.details.addresses.values()].find(group=>group.length>=2);
  const id=shared[0].page, index=journal.entries.findIndex(p=>p.id===id);
  forgetPageAt(journal,index);
  const after=plan(journal), remaining=residents(after.details);
  assert.equal(remaining.size,saved.size-1);
  for(const [key,value] of saved)assert.deepEqual(remaining.get(key),key===id?undefined:value);
  assert.equal(after.coast.addresses.get(shared[1].page).x,before.coast.addresses.get(id).x);
  assert.deepEqual(Object.keys(journal.forgotten[0]).sort(),['created_at','forgottenAfter','id','position','riverEdition']);
  const [street]=before.details.streets.keys(), supported=before.coast.neighborhoods.get(street).anchors;
  const selected=new Set(supported.slice(0,3).map(s=>s.id));
  const focus=year('quay','clouds').map(p=>selected.has(p.id)?{...p,body:'Went swimming.'}:p);
  assert.ok(journalDetails(before.coast,focus).streets.has(street));
  const isolated={entries:focus,forgotten:[]};
  forgetPageAt(isolated,focus.findIndex(p=>selected.has(p.id)));
  assert.equal(plan(isolated).details.streets.size,0);
  const oneSite=before.coast.addresses.get(shared[0].page);
  const single=focus.map(p=>({...p,body:before.coast.addresses.get(p.id)===oneSite?'Went swimming. Went swimming.':'clouds'}));
  assert.equal(journalDetails(before.coast,single).streets.size,0);
});

test('every activity can furnish both settings and mixed scenes retain explicit qualifiers', () => {
  const entries=year('high street',''), coast=paintedCoast(entries);
  for(const family of ['water','travel','meals','making','growing','gathering','reading']){
    const body=excerpts.find(([label])=>label===family)[1];
    const choices=[...residents(journalDetails(coast,entries.map(p=>({...p,body})))).values()];
    assert.equal(new Set(choices.map(item=>item.socket)).size,2,family);
    assert.ok(new Set(choices.map(item=>item.detail)).size>=3,family);
  }
  const dawn=recognizeScene('Swam at dawn alone.');
  assert.deepEqual(dawn,{activities:['water'],early:true,company:false,outdoors:false});
  const race=recognizeScene('Went swimming with my friends in a race.');
  assert.ok(race.company && race.activities.includes('water'));
  assert.deepEqual(recognizeScene('I repaired the canoe on the porch.').activities,['making']);
  assert.deepEqual(recognizeScene('I never went kayaking, but I planted herbs outdoors.'),
    {activities:['growing'],early:false,company:false,outdoors:true});
});
