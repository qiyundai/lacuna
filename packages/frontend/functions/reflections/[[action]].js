export function onRequest({ request, env }) {
  if (new URL(request.url).origin !== 'https://lacuna.quietatlas.io') {
    return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const headers = new Headers(request.headers);
  headers.set('X-Lacuna-Edge-IP', request.headers.get('CF-Connecting-IP') ?? 'unknown');
  return env.BILLING.fetch(new Request(request, { headers, redirect: 'manual' }));
}
