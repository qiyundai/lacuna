const eligibleCanadianRegions = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'SK', 'YT']);

export function journalAvailable(country: unknown, regionCode: unknown): boolean {
  return country === 'US' || (country === 'CA' && typeof regionCode === 'string' && eligibleCanadianRegions.has(regionCode));
}

export function regionalDenial(request: Request, eligible: boolean): Response | undefined {
  if (eligible || !['POST', 'PUT'].includes(request.method)) return;
  let path: string;
  try {
    path = decodeURI(new URL(request.url).pathname).replace(/\/+$/, '');
  } catch {
    return new Response(null, { status: 400 });
  }
  const restricted = request.method === 'PUT' ? path === '/journal-sync' :
    path === '/reflections/checkout' || path === '/reflections/generate';
  if (!restricted) return;
  return Response.json({ code: 'region_unavailable', error: 'Journaling is available in the United States and Canada outside Québec.' }, {
    status: 403, headers: { 'Cache-Control': 'private, no-store' }
  });
}
