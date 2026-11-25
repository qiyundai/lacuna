import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { paintedCoast } from '../packages/frontend/src/lib/town/painted-coast.ts';
import { venueKinds, riverVenues, siteName, isRiverVenue } from '../packages/frontend/src/lib/town/architecture-catalog.ts';
import { createHarborBuildings } from '../packages/frontend/src/lib/town/harbor-buildings.ts';
import { currentRiverEdition, forgetPageAt, validCityHistory } from '../packages/shared/city-address.ts';

function pages(seed, count, edition = currentRiverEdition) {
  return Array.from({length:count}, (_,i) => ({
    id:createHash('md5').update(seed+'/'+i).digest('hex'), created_at:i, riverEdition:edition
  }));
}

test('earlier cities keep their addresses as new places arrive and pages are forgotten', () => {
  const archive=pages('archive',140).map((page,i)=>({...page,riverEdition:i<20?undefined:i<45?2:3}));
  const historic=paintedCoast(archive);
  assert.equal(createHash('sha256').update(JSON.stringify(historic.sites)).digest('hex'),
    '8f118e45525f5612dc3fb7c6a3ea076b6f1dd9c8f78f59cde6d4c94dd6b6a08f');
  const entries=[...archive,...pages('extension',100).map(page=>({...page,created_at:page.created_at+140}))];
  const journal={entries,forgotten:[]};
  const expanded=paintedCoast(entries);
  for(const site of historic.sites) {
    const next=expanded.addresses.get(site.id);
    assert.deepEqual({...next,lights:site.lights},site);
  }
  const place=expanded.sites.find(site=>isRiverVenue(site.kind));
  const index=entries.findIndex(page=>page.id===place.id);
  forgetPageAt(journal,index);
  assert.ok(validCityHistory(entries,journal.forgotten));
  const restored=paintedCoast(structuredClone(entries),structuredClone(journal.forgotten));
  assert.deepEqual(restored.sites.map(({id,kind,x,bank,elevation})=>[id,kind,x,bank,elevation]),
    expanded.sites.map(({id,kind,x,bank,elevation})=>[id,kind,x,bank,elevation]));
  assert.equal(restored.addresses.has(place.id),false);
});

test('places appear across writing horizons and cycle through elevations on return visits', () => {
  for(let seed=0;seed<12;seed++){
    const entries=pages(seed,365),plan=paintedCoast(entries);
    const seenAt=n=>new Set(entries.slice(0,n).map(page=>plan.addresses.get(page.id).kind).filter(k=>k!=='pines'));
    assert.ok(seenAt(7).size>=5);
    assert.ok(seenAt(14).size>=9);
    assert.ok(seenAt(30).size>=20);
    assert.equal(seenAt(120).size,32);
    assert.ok(plan.ports.some(site=>site.bank===1));
    for(const kind of venueKinds){
      const visits=plan.sites.filter(site=>site.kind===kind);
      assert.ok(visits.length>=6,kind);
      assert.equal(new Set(visits.slice(0,6).map(site=>site.elevation)).size,6,kind);
      assert.ok(visits.every(site=>riverVenues[kind].lanes.includes(site.lane)));
      assert.ok(plan.sites.indexOf(visits[0])>=riverVenues[kind].after);
    }
  }
});

test('every new address has distinct elevations, illustrated pages, lit glazing, a connected door and growable rooms', () => {
  for(const kind of venueKinds){
    const plate=readFileSync('packages/frontend/static/city/paint/'+kind+'.webp');
    assert.equal(plate.toString('ascii',8,12),'WEBP');
    assert.ok(siteName(kind).length>3);
    const kit=createHarborBuildings(), signatures=new Set();
    try {
      for(let elevation=0;elevation<6;elevation++){
        const model=kit.build(kind,42,7,0,undefined,elevation);
        const door=model.getObjectByName('Door threshold');
        assert.ok(door,kind);
        const bounds=new T.Box3().setFromObject(model);
        assert.ok(bounds.max.y>1.8 && bounds.max.y<14,kind);
        const entrance=door.getWorldPosition(new T.Vector3());
        signatures.add([bounds.min.x,bounds.max.x,entrance.x,bounds.max.y].join('/'));
        let glazing=0;
        model.traverse(node=>{if(node.geometry?.userData.glassFinish==='glazing')glazing++});
        assert.ok(glazing>0,kind);
        const skyline=kit.skyline(kind,elevation,0);
        const distantBounds=new T.Box3().setFromObject(skyline);
        assert.ok(Math.abs(bounds.max.y-distantBounds.max.y)<1.6,kind);
        let distantTriangles=0;
        skyline.traverse(node=>{
          if(node.isMesh)distantTriangles+=(node.geometry.index?.count ?? node.geometry.attributes.position.count)/3;
        });
        assert.ok(distantTriangles<600,kind);
      }
      assert.equal(signatures.size,6,kind);
      const grown=kit.build(kind,42,7,2,undefined,0);
      assert.ok(grown.getObjectByName('Room floor 1') && grown.getObjectByName('Room floor 2'));
      assert.ok(grown.getObjectByName('Window ledge'));
    }finally{kit.dispose();}
  }
});
