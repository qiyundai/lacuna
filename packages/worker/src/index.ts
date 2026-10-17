import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './types.js';
import { authRoute } from './routes/auth.js';
import { entriesRoute } from './routes/entries.js';
import { patternsRoute } from './routes/patterns.js';
import { memoirRoute } from './routes/memoir.js';
import { aiRoute } from './routes/ai.js';
import { storyRoute } from './routes/story.js';
import { privacyRoute } from './routes/privacy.js';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => bodyLimit({ maxSize: c.req.path === '/privacy/sync' ? 7 * 1024 * 1024 : 262144, onError: (ctx) => ctx.json({ error: { code: 'TOO_LARGE', message: 'Request too large' } }, 413) })(c, next));

app.use('*', async (c, next) => {
  const origin = c.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  return cors({
    origin,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
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

app.get('/health', (c) => c.json({ ok: true, version: '0.3.0' }));

// Old clients must never create fresh plaintext journals or derived material.
app.use('*', async (c, next) => {
  if (['POST', 'PATCH', 'PUT'].includes(c.req.method) && /^\/(entries|patterns|ai)(\/|$)/.test(c.req.path)) return c.json({ error: { code: 'PRIVATE_VAULT_REQUIRED', message: 'Update the local companion. New journal content belongs in your encrypted local vault.' } }, 410);
  await next();
  return;
});

app.route('/auth', authRoute);
app.route('/entries', entriesRoute);
app.route('/patterns', patternsRoute);
app.route('/memoir', memoirRoute);
app.route('/ai', aiRoute);
app.route('/story', storyRoute);
app.route('/privacy', privacyRoute);

app.onError((err, c) => {
  if (err instanceof SyntaxError) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, 400);
  if (err instanceof HTTPException) return err.getResponse();
  console.error('Request failed:', err.name);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500);
});

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

export default app;
