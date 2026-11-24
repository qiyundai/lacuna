import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../packages/frontend/functions/availability.js';
import { onRequest } from '../packages/frontend/functions/reflections/[[action]].js';
import { regionalDenial } from '../packages/shared/region.ts';

function visitor(path, country, method = 'GET', regionCode) {
  const request = new Request('https://lacuna.quietatlas.io' + path, {
    method, headers: { 'X-Lacuna-Region-Eligible': 'true', 'CF-IPCountry': 'CA' }
  });
  Object.defineProperty(request, 'cf', { value: { country, regionCode } });
  return request;
}

test('eligibility uses the edge country and Canadian province without disclosing them', async () => {
  for (const [country, region, available] of [
    ['CA','BC',true], ['CA','ON',true], ['CA','NU',true], ['CA','QC',false], ['CA',undefined,false],
    ['CA','XX',false], ['US',undefined,true], ['DE','BC',false], [undefined,undefined,false]
  ]) {
    const response = onRequestGet({ request: visitor('/availability', country, 'GET', region) });
    assert.deepEqual(await response.json(), { available });
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});

test('Pages denies restricted requests before forwarding and replaces the region header', async () => {
  const env = { BILLING: { fetch: async request => new Response(request.headers.get('X-Lacuna-Region-Eligible')) } };
  for (const path of ['/reflections/checkout', '/reflections/generate']) {
    assert.equal(onRequest({ request: visitor(path, 'DE', 'POST'), env }).status, 403);
    assert.equal(onRequest({ request: visitor(path, 'CA', 'POST', 'QC'), env }).status, 403);
    const blocked = onRequest({ request: visitor(path, 'US', 'POST'), env: {} });
    assert.equal(blocked.status,503);
    assert.equal((await blocked.json()).code,'COMING_SOON');
  }
  for (const action of ['consent', 'portal', 'webhook', 'account', 'login', 'verify', 'logout']) {
    assert.equal(await (await onRequest({ request: visitor('/reflections/'+action, 'US', 'POST'), env })).text(), 'true');
    assert.equal(await (await onRequest({ request: visitor('/reflections/'+action, undefined, 'POST'), env })).text(), 'false');
  }
});

test('regional restrictions allow travellers to retrieve or delete encrypted copies', () => {
  assert.equal(regionalDenial(visitor('/journal-sync', 'DE', 'PUT'), false).status, 403);
  for (const method of ['GET','DELETE','OPTIONS']) assert.equal(regionalDenial(visitor('/journal-sync', 'DE', method), false), undefined);
  assert.equal(regionalDenial(visitor('/journal-sync', 'CA', 'PUT'), true), undefined);
});
