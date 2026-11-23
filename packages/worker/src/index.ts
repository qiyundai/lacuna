import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './types.js';
import reflections from './routes/reflections.js';
import browserSync, { syncOrigins } from './routes/browser-sync.js';
import { syncLimit } from '../../shared/sync-packet.js';
import { aiAvailable } from '../../shared/ai-release.js';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => bodyLimit({ maxSize: c.req.path === '/journal-sync' ? syncLimit+256 : 262144, onError: (ctx) => ctx.json({ error: { code: 'TOO_LARGE', message: 'Request too large' } }, 413) })(c, next));

app.use('*', async (c, next) => {
  const origin = c.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  return cors({
    origin: c.req.path === '/journal-sync' ? syncOrigins(c.env) : origin,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'If-None-Match'],
    maxAge: 86400,
  })(c, next);
});

app.use('*', async (c, next) => {
  await next();
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  c.header('Cache-Control', 'no-store');
});

app.get('/health', (c) => c.json({ ok: true, version: '0.4.0' }));

app.route('/journal-sync', browserSync);
if (aiAvailable) app.route('/reflections', reflections);
else app.all('/reflections/*', c => c.json({code:'COMING_SOON',error:'AI reflections are coming soon.'},503));

app.onError((err, c) => {
  if (err instanceof SyntaxError) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, 400);
  if (err instanceof HTTPException) return err.getResponse();
  console.error('Request failed:', err.name);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500);
});

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

export default app;
