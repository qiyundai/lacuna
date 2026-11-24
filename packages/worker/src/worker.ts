import { WorkerEntrypoint } from 'cloudflare:workers';
import app from './index.js';
import { journalAvailable, regionalDenial } from '../../shared/region.js';
import { maintainAccounts } from './routes/reflections.js';
import type { Env } from './types.js';
import { operationsSummary } from './operations.js';

export class ConsoleService extends WorkerEntrypoint<Env> {
  async fetch(request: Request) {
    const { pathname, search } = new URL(request.url);
    if (request.method !== 'GET' || search) return new Response(null, { status: 400 });
    if (pathname === '/health') {
      return app.request('https://internal/health/maintenance', {}, this.env);
    }
    if (pathname !== '/summary') return new Response(null, { status: 404 });
    return Response.json(await operationsSummary(this.env), { headers: { 'Cache-Control': 'no-store' } });
  }
}

function regionalRequest(request: Request, env: Env, ctx: ExecutionContext, eligible: boolean) {
  return regionalDenial(request, eligible) ?? app.fetch(request, env, ctx);
}

export class BillingIngress extends WorkerEntrypoint<Env> {
  async fetch(request: Request) {
    const headers = new Headers(request.headers);
    headers.set('CF-Connecting-IP', headers.get('X-Lacuna-Edge-IP') ?? 'unknown');
    headers.delete('X-Lacuna-Edge-IP');
    const eligible = headers.get('X-Lacuna-Region-Eligible') === 'true';
    headers.delete('X-Lacuna-Region-Eligible');
    return regionalRequest(new Request(request, { headers }), this.env, this.ctx, eligible);
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return regionalRequest(request, env, ctx, journalAvailable(request.cf?.country, request.cf?.regionCode));
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    await maintainAccounts(env);
  }
};
