import { journalAvailable } from '../../shared/region.ts';

export function onRequestGet({ request }) {
  return Response.json({ available: journalAvailable(request.cf?.country, request.cf?.regionCode) }, {
    headers: { 'Cache-Control': 'private, no-store' }
  });
}
