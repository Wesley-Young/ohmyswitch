import { definePlugin } from '../kernel.ts';
import { ModelsDevService } from '../models-dev/service.ts';
import { StoreService } from '../store/service.ts';
import { HarnessService } from './service.ts';
import type { HarnessEnvironment } from './types.ts';

export const HarnessesPlugin = definePlugin({
  name: 'ohmyswitch-harnesses',
  inject: { store: StoreService, modelsDev: ModelsDevService },
  provides: [HarnessService],
  apply(ctx, environment: HarnessEnvironment) {
    ctx.provide(HarnessService, new HarnessService(ctx, environment));
  },
});
