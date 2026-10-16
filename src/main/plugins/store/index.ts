import { definePlugin } from '../../kernel.ts';
import { StoreService } from './service.ts';

export const StorePlugin = definePlugin({
  name: 'ohmyswitch-store',
  provides: [StoreService],
  async apply(ctx) {
    const store = new StoreService(ctx.config.dataDir);
    await store.load();
    ctx.provide(StoreService, store);
  },
});
