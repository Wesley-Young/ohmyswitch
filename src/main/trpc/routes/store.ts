import { tracked } from '@trpc/server';

import type { StoreService } from '#core/store/service.ts';
import { publicProcedure } from '#main/trpc/procedures.ts';

export function storeRoutes(store: StoreService) {
  return {
    // A signal to refetch after another process, such as the CLI, changed the data. No data goes through here.
    events: publicProcedure.subscription(async function* ({ signal }) {
      let sequence = 0;
      for await (const _ of store.events(signal ?? new AbortController().signal)) {
        sequence++;
        yield tracked(String(sequence), { sequence });
      }
    }),
  };
}
