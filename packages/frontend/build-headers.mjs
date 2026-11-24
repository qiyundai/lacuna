import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadEnv } from 'vite';
import { defaultApiOrigin } from '../shared/sync-packet.ts';

const directory = resolve(process.env.LACUNA_BUILD_DIR ?? 'build');
const html = await readFile(resolve(directory, 'index.html'), 'utf8');
const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(match => match[1].trim()).map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
const apiBase = loadEnv('production', process.cwd()).VITE_API_URL ?? defaultApiOrigin;
const self = 'https://same-origin.invalid';
const sync = new URL(apiBase + '/journal-sync', self);
if (!['https:', 'http:'].includes(sync.protocol) || sync.username || sync.password || sync.search || sync.hash) throw new Error('Invalid sync endpoint.');
const connections = sync.origin === self ? "'self'" : `'self' ${sync.origin}${sync.pathname}`;
const csp = `default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; connect-src ${connections}; media-src 'self' blob:; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
const headers = await readFile(resolve(directory, '_headers'), 'utf8');
const securityHeaders = `/*\n  Content-Security-Policy: ${csp}\n  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Strict-Transport-Security: max-age=31536000; includeSubDomains`;
if (!/^\/\*\r?$/m.test(headers)) throw new Error('Missing global Pages header rule.');
await writeFile(resolve(directory, '_headers'), headers.replace(/^\/\*\r?$/m, () => securityHeaders));
