import { net } from 'electron';

import { definePlugin } from '../../kernel.ts';
import { HarnessService } from '../harnesses/service.ts';
import { ModelsDevService } from '../models-dev/service.ts';
import { StoreService } from '../store/service.ts';
import { ProviderService } from './service.ts';

export const ProvidersPlugin = definePlugin({
  name: 'ohmyswitch-providers',
  inject: { store: StoreService, harnesses: HarnessService, modelsDev: ModelsDevService },
  provides: [ProviderService],
  apply(ctx) {
    // Electron's network stack honors the system proxy, which Node's fetch does not.
    const fetch = (url: string, init: RequestInit) => net.fetch(url, init);
    ctx.provide(ProviderService, new ProviderService(ctx.store, ctx.harnesses, fetch, ctx.modelsDev, ctx.logger));
  },
});
