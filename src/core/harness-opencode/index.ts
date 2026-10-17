import { HarnessService } from '../harnesses/service.ts';
import { definePlugin } from '../kernel.ts';
import { opencode } from './descriptor.ts';

/** OpenCode: registers the descriptor next to this file. The contract it implements is `docs/harness/opencode.md`. */
export const OpenCodeHarnessPlugin = definePlugin({
  name: 'ohmyswitch-harness-opencode',
  inject: { harnesses: HarnessService },
  apply(ctx) {
    ctx.harnesses.register(opencode);
  },
});
