import { definePlugin } from '../../kernel.ts';
import { HarnessService } from './service.ts';

export const HarnessesPlugin = definePlugin({
  name: 'ohmyswitch-harnesses',
  provides: [HarnessService],
  apply(ctx) {
    ctx.provide(HarnessService, new HarnessService({ home: ctx.config.home, env: ctx.config.env }));
  },
});
