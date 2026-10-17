import { tracked } from '@trpc/server';

import { eventsInput, pendingImportInput } from '#core/deep-links/schemas.ts';
import type { DeepLinkService } from '#core/deep-links/service.ts';
import { publicProcedure } from '#main/trpc/procedures.ts';

export function deepLinkRoutes(deepLinks: DeepLinkService) {
  return {
    pending: publicProcedure.query(() => deepLinks.pending()),
    dismiss: publicProcedure.input(pendingImportInput).mutation(({ input }) => deepLinks.dismiss(input.id)),
    // Tracked by event id: on reconnect the client sends the last id, so the pending import is not replayed.
    events: publicProcedure.input(eventsInput).subscription(async function* ({ input, signal }) {
      for await (const event of deepLinks.events(signal ?? new AbortController().signal, input?.lastEventId)) {
        yield tracked(event.id, event);
      }
    }),
  };
}
