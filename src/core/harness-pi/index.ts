import { HarnessService } from '../harnesses/service.ts';
import { definePlugin } from '../kernel.ts';
import { pi } from './descriptor.ts';

/** Pi: registers the descriptor next to this file. The contract it implements is `docs/harness/pi.md`. */
export const PiHarnessPlugin = definePlugin({
  name: 'ohmyswitch-harness-pi',
  inject: { harnesses: HarnessService },
  apply(ctx) {
    ctx.harnesses.register(pi);
  },
});
