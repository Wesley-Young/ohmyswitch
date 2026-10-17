import { HarnessService } from '../harnesses/service.ts';
import { definePlugin } from '../kernel.ts';
import { dsh } from './descriptor.ts';

/** DeepSeek Harness: registers the descriptor next to this file. The contract it implements is `docs/harness/dsh.md`. */
export const DshHarnessPlugin = definePlugin({
  name: 'ohmyswitch-harness-dsh',
  inject: { harnesses: HarnessService },
  apply(ctx) {
    ctx.harnesses.register(dsh);
  },
});
