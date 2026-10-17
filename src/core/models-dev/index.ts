import { HttpService } from '../http/service.ts';
import { definePlugin } from '../kernel.ts';
import { ModelsDevService } from './service.ts';

export interface ModelsDevOptions {
  /** Where the reduced catalog is cached between runs. */
  cachePath: string;
}

export const ModelsDevPlugin = definePlugin({
  name: 'ohmyswitch-models-dev',
  inject: { http: HttpService },
  provides: [ModelsDevService],
  apply(ctx, options: ModelsDevOptions) {
    ctx.provide(ModelsDevService, new ModelsDevService(ctx, options.cachePath));
  },
});
