import { definePlugin } from '../../../core/kernel.ts';
import { AppProtocol } from '../protocol/service.ts';
import { WindowService } from './service.ts';

export const WindowPlugin = definePlugin({
  name: 'ohmyswitch-window',
  inject: { protocol: AppProtocol },
  provides: [WindowService],
  apply(ctx) {
    ctx.provide(WindowService, new WindowService(ctx.protocol.origin));
  },
  // Injecting the protocol orders this after it, so the page loads once app:// is served.
  start(ctx) {
    ctx.resolve(WindowService).show();
  },
});
