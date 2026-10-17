import { definePlugin } from '../kernel.ts';
import { StoreService } from './service.ts';

export interface StoreOptions {
  /** ohmyswitch's data directory, which holds `store.json`. */
  dataDir: string;
}

export const StorePlugin = definePlugin({
  name: 'ohmyswitch-store',
  provides: [StoreService],
  async apply(ctx, options: StoreOptions) {
    const store = new StoreService(options.dataDir);
    await store.load();
    ctx.provide(StoreService, store);
  },
});
