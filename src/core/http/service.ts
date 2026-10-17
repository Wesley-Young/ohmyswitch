import { type Context, Service } from 'cordis';

import type { Fetch } from './fetch.ts';

declare module 'cordis' {
  interface Context {
    http: HttpService;
  }
}

/**
 * Outgoing HTTP for business services, registered as `ctx.http`. Core only defines it; the plugin that subclasses
 * it decides which network stack is used.
 */
export abstract class HttpService extends Service {
  abstract readonly fetch: Fetch;

  constructor(ctx: Context) {
    super(ctx, 'http');
  }
}
