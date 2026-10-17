// Static, local-only phone QA. No production data, cloud account, or AI requests.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
await build({ entryPoints: ['tests/web-fixture.ts'], outfile: '.test-output/web-fixture.js', bundle: true, platform: 'browser', target: 'es2022', format: 'esm' });
const directory = resolve('packages/frontend/build');
const headers = await readFile(resolve(directory, '_headers'), 'utf8');
const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1];
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  if (csp) res.setHeader('Content-Security-Policy', csp);
  try {
    if (req.headers.host !== '127.0.0.1:1457' || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1:1457');
    if (url.pathname === '/fixture-setup') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><p>Preparing disposable encrypted sample…</p><script type="module" src="/fixture.js"></script>'); return; }
    if (url.pathname === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile('.test-output/web-fixture.js')); return; }
    let path = resolve(directory, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(directory + sep) && path !== directory) { res.writeHead(403); res.end(); return; }
    if (!(await stat(path).catch(() => null))?.isFile()) path = resolve(directory, 'index.html');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[extname(path)] ?? 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : await readFile(path));
  } catch { res.writeHead(500); res.end('Preview unavailable'); }
});
server.listen(1457, '127.0.0.1', () => console.log('Phone QA only: http://127.0.0.1:1457'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
