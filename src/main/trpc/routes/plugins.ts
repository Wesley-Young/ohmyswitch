import { tracked } from '@trpc/server';

import { setEnabledInput } from '#core/plugins/schemas.ts';
import type { PluginService } from '#core/plugins/service.ts';
import { publicProcedure } from '#main/trpc/procedures.ts';

export function pluginRoutes(plugins: PluginService) {
  return {
    list: publicProcedure.query(() => plugins.list()),
    setEnabled: publicProcedure
      .input(setEnabledInput)
      .mutation(({ input }) => plugins.setEnabled(input.id, input.enabled)),
    // A signal to refetch, whoever made the change: this window, another process, or an edit of plugins.yml.
    events: publicProcedure.subscription(async function* ({ signal }) {
      let sequence = 0;
      for await (const _ of plugins.events(signal ?? new AbortController().signal)) {
        sequence++;
        yield tracked(String(sequence), { sequence });
      }
    }),
  };
}
