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

const app = new Hono<{ Bindings: Env }>();

app.use('*', bodyLimit({ maxSize: 262144, onError: (c) => c.json({ error: { code: 'TOO_LARGE', message: 'Request too large' } }, 413) }));

app.use('*', async (c, next) => {
  const origin = c.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  return cors({
    origin,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })(c, next);
});

app.use('*', async (c, next) => {
  await next();
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Cache-Control', 'no-store');
});

app.get('/health', (c) => c.json({ ok: true, version: '0.2.0' }));

app.route('/auth', authRoute);
app.route('/entries', entriesRoute);
app.route('/patterns', patternsRoute);
app.route('/memoir', memoirRoute);
app.route('/ai', aiRoute);
app.route('/story', storyRoute);

app.onError((err, c) => {
  if (err instanceof SyntaxError) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, 400);
  if (err instanceof HTTPException) return err.getResponse();
  console.error('Request failed:', err.name);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500);
});

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

export default app;
