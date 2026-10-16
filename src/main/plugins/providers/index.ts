import { definePlugin } from '../../kernel.ts';
import { StoreService } from '../store/service.ts';
import { ProviderService } from './service.ts';

export const ProvidersPlugin = definePlugin({
  name: 'ohmyswitch-providers',
  inject: { store: StoreService },
  provides: [ProviderService],
  apply(ctx) {
    ctx.provide(ProviderService, new ProviderService(ctx.store));
  },
});
