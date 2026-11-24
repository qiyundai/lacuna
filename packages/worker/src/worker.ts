import { WorkerEntrypoint } from 'cloudflare:workers';
import app from './index.js';
import { maintainAccounts } from './routes/reflections.js';
import type { Env } from './types.js';

export class BillingIngress extends WorkerEntrypoint<Env> {
  async fetch(request: Request) {
    const headers = new Headers(request.headers);
    headers.set('CF-Connecting-IP', headers.get('X-Lacuna-Edge-IP') ?? 'unknown');
    headers.delete('X-Lacuna-Edge-IP');
    return app.fetch(new Request(request,{headers}),this.env,this.ctx);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env) {
    await maintainAccounts(env);
  }
};
