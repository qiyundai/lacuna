import { startCompanion } from './server.mjs';
startCompanion().then(app => {
  console.log(`Lacuna companion: ${app.origin}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => process.exit(0)));
}).catch(err => { console.error(err.message); process.exitCode = 1; });
