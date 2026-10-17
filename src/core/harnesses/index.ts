import type { Context, Plugin } from 'cordis';

import type { HarnessDescriptor } from './types.ts';

/** The plugin that makes one harness available while it is loaded. */
export function harnessPlugin(harness: HarnessDescriptor): Plugin.Object<void> {
  return {
    name: `harness-${harness.id}`,
    inject: ['harnesses'],
    apply(ctx: Context) {
      ctx.harnesses.register(harness);
    },
  };
}
