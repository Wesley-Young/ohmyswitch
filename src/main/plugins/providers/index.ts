import { net } from 'electron';

import { definePlugin } from '../../kernel.ts';
import { HarnessService } from '../harnesses/service.ts';
import { StoreService } from '../store/service.ts';
import { ModelsDevCatalog } from './models-dev.ts';
import { ProviderService } from './service.ts';

import { join } from 'node:path';

export const ProvidersPlugin = definePlugin({
  name: 'ohmyswitch-providers',
  inject: { store: StoreService, harnesses: HarnessService },
  provides: [ProviderService],
  apply(ctx) {
    // Electron's network stack honors the system proxy, which Node's fetch does not.
    const fetch = (url: string, init: RequestInit) => net.fetch(url, init);
    const modelsDev = new ModelsDevCatalog(join(ctx.config.dataDir, 'cache', 'models-dev.json'), fetch, ctx.logger);
    ctx.provide(ProviderService, new ProviderService(ctx.store, ctx.harnesses, fetch, modelsDev, ctx.logger));
  },
});
