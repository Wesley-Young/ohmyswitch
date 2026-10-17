import type { Context } from 'cordis';

import type { ManagedPlugin } from '../plugins/service.ts';
import type { HarnessDescriptor } from './types.ts';

/**
 * The plugin that makes one harness available while it is enabled in `plugins.yml`, where it is referred to as
 * `cordis:harness-<id>`.
 */
export function harnessPlugin(harness: HarnessDescriptor): ManagedPlugin {
  return {
    name: `harness-${harness.id}`,
    id: harness.id,
    title: harness.name,
    inject: ['harnesses'],
    apply(ctx: Context) {
      ctx.harnesses.register(harness);
    },
  };
}
