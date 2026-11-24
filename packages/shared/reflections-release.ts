export const aiAvailable = false;

export function reflectionsUnavailable() {
  return Response.json({ code: 'COMING_SOON', error: 'Reflections is coming soon. Checkout is closed.' }, {
    status: 503, headers: { 'Cache-Control': 'no-store' }
  });
}
