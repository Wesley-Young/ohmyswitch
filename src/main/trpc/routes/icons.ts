import type { IconService } from '#core/icons/service.ts';
import { providerIdInput } from '#core/providers/schemas.ts';
import { publicProcedure } from '#main/trpc/procedures.ts';

export function iconRoutes(icons: IconService) {
  return {
    get: publicProcedure.input(providerIdInput).query(({ input }) => icons.get(input.providerId)),
    refresh: publicProcedure.input(providerIdInput).mutation(({ input }) => icons.refresh(input.providerId)),
  };
}
