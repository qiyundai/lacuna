// Kill-switch: unregister the legacy service worker and wipe its caches.
// The app no longer uses a service worker. This file exists only so that
// browsers with the old SW installed fetch a parseable script, install this
// one, and let it clean everything up before unregistering itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  await self.registration.unregister();
  const clients = await self.clients.matchAll({ type: 'window' });
  await Promise.all(clients.map(c => c.navigate(c.url)));
});
