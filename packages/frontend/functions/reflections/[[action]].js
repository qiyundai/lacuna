import { journalAvailable, regionalDenial } from '../../../shared/region.ts';
import { aiAvailable, reflectionsUnavailable } from '../../../shared/reflections-release.ts';

const accountPaths = new Set(['account', 'login', 'verify', 'logout', 'consent', 'portal', 'webhook'].map(action => '/reflections/' + action));

export function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (url.origin !== 'https://lacuna.quietatlas.io') {
    return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const eligible = journalAvailable(request.cf?.country, request.cf?.regionCode);
  const denied = regionalDenial(request, eligible);
  if (denied) return denied;
  if (!aiAvailable && !accountPaths.has(url.pathname)) return reflectionsUnavailable();
  const headers = new Headers(request.headers);
  headers.set('X-Lacuna-Region-Eligible', String(eligible));
  headers.set('X-Lacuna-Edge-IP', request.headers.get('CF-Connecting-IP') ?? 'unknown');
  return env.BILLING.fetch(new Request(request, { headers, redirect: 'manual' }));
}
