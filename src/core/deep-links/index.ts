import { definePlugin } from '../kernel.ts';
import { StoreService } from '../store/service.ts';
import { DeepLinkService } from './service.ts';

export const DeepLinksPlugin = definePlugin({
  name: 'ohmyswitch-deep-links',
  inject: { store: StoreService },
  provides: [DeepLinkService],
  apply(ctx) {
    ctx.provide(DeepLinkService, new DeepLinkService(ctx));
  },
});
