import { net } from 'electron';

import { definePlugin } from '../../kernel.ts';
import { ModelsDevService } from './service.ts';

import { join } from 'node:path';

export const ModelsDevPlugin = definePlugin({
  name: 'ohmyswitch-models-dev',
  provides: [ModelsDevService],
  apply(ctx) {
    // Electron's network stack honors the system proxy, which Node's fetch does not.
    const fetch = (url: string, init: RequestInit) => net.fetch(url, init);
    ctx.provide(
      ModelsDevService,
      new ModelsDevService(join(ctx.config.dataDir, 'cache', 'models-dev.json'), fetch, ctx.logger),
    );
  },
});
