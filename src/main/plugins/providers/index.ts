import { net } from 'electron';

import { definePlugin } from '../../kernel.ts';
import { StoreService } from '../store/service.ts';
import { ProviderService } from './service.ts';

export const ProvidersPlugin = definePlugin({
  name: 'ohmyswitch-providers',
  inject: { store: StoreService },
  provides: [ProviderService],
  apply(ctx) {
    // Electron's network stack honors the system proxy, which Node's fetch does not.
    ctx.provide(ProviderService, new ProviderService(ctx.store, (url, init) => net.fetch(url, init)));
  },
});
