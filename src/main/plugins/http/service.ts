import { net } from 'electron';

import type { Fetch } from '#core/http/fetch.ts';
import { HttpService } from '#core/http/service.ts';

/** `ctx.http` on Electron's network stack, which honors the system proxy; Node's fetch does not. */
export class ElectronHttpService extends HttpService {
  readonly fetch: Fetch = (url, init) => net.fetch(url, init);
}
