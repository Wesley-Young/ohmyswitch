import { definePlugin } from '../../kernel.ts';
import { ModelsDevService } from '../models-dev/service.ts';
import { StoreService } from '../store/service.ts';
import { HarnessService } from './service.ts';

export const HarnessesPlugin = definePlugin({
  name: 'ohmyswitch-harnesses',
  inject: { store: StoreService, modelsDev: ModelsDevService },
  provides: [HarnessService],
  apply(ctx) {
    const environment = { home: ctx.config.home, env: ctx.config.env };
    ctx.provide(HarnessService, new HarnessService(environment, ctx.store, ctx.modelsDev));
  },
});
