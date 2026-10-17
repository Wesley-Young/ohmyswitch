import { serviceToken } from '@fraqjs/kernel';

import type { Fetch } from './fetch.ts';

/** Outgoing HTTP for business services. The plugin that provides it decides which network stack is used. */
export class HttpService {
  static readonly token = serviceToken<HttpService>('ohmyswitch/http');
  readonly fetch: Fetch;

  constructor(fetch: Fetch) {
    this.fetch = fetch;
  }
}
