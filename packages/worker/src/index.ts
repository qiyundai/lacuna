import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types.js';
import { authRoute } from './routes/auth.js';
import { entriesRoute } from './routes/entries.js';
import { patternsRoute } from './routes/patterns.js';
import { memoirRoute } from './routes/memoir.js';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const origin = c.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  return cors({
    origin,
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })(c, next);
});

app.get('/health', (c) => c.json({ ok: true, version: '0.1.0' }));

app.route('/auth', authRoute);
app.route('/entries', entriesRoute);
app.route('/patterns', patternsRoute);
app.route('/memoir', memoirRoute);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, 500);
});

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

export default app;
