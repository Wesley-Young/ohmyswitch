import { net } from 'electron';

import { HttpService } from '../../../core/http/service.ts';
import { definePlugin } from '../../../core/kernel.ts';

export const HttpPlugin = definePlugin({
  name: 'ohmyswitch-http',
  provides: [HttpService],
  apply(ctx) {
    // Electron's network stack honors the system proxy, which Node's fetch does not.
    ctx.provide(HttpService, new HttpService((url, init) => net.fetch(url, init)));
  },
});
