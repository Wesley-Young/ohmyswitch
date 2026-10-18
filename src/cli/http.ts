import type { Fetch } from '#core/http/fetch.ts';
import { HttpService } from '#core/http/service.ts';

/**
 * `ctx.http` on Node's fetch. Proxies come from `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`, which the entry point
 * applies before any request.
 */
export class NodeHttpService extends HttpService {
  readonly fetch: Fetch = (url, init) => fetch(url, init);
}
