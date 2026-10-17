import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const directory = resolve(process.env.LACUNA_BUILD_DIR ?? 'build');
const html = await readFile(resolve(directory, 'index.html'), 'utf8');
const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(match => match[1].trim()).map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
const csp = `default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
const headers = await readFile(resolve(directory, '_headers'), 'utf8');
await writeFile(resolve(directory, '_headers'), `${headers}\n/*\n  Content-Security-Policy: ${csp}\n  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n`);
