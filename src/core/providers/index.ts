import { HarnessService } from '../harnesses/service.ts';
import { HttpService } from '../http/service.ts';
import { definePlugin } from '../kernel.ts';
import { ModelsDevService } from '../models-dev/service.ts';
import { StoreService } from '../store/service.ts';
import { ProviderService } from './service.ts';

export const ProvidersPlugin = definePlugin({
  name: 'ohmyswitch-providers',
  inject: { store: StoreService, harnesses: HarnessService, http: HttpService, modelsDev: ModelsDevService },
  provides: [ProviderService],
  apply(ctx) {
    ctx.provide(ProviderService, new ProviderService(ctx));
  },
});
