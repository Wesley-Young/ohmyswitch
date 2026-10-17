import { HttpService } from '../http/service.ts';
import { definePlugin } from '../kernel.ts';
import { StoreService } from '../store/service.ts';
import { IconService } from './service.ts';

export interface IconOptions {
  /** Where provider icons are cached between runs, one file per provider. */
  cacheDir: string;
}

export const IconsPlugin = definePlugin({
  name: 'ohmyswitch-icons',
  inject: { http: HttpService, store: StoreService },
  provides: [IconService],
  apply(ctx, options: IconOptions) {
    ctx.provide(IconService, new IconService(ctx, options.cacheDir));
  },
});
