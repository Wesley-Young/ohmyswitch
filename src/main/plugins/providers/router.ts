import { publicProcedure } from '../../trpc/procedures.ts';
import { createProviderInput, providerIdInput } from './schemas.ts';
import type { ProviderService } from './service.ts';

export function providerRoutes(providers: ProviderService) {
  return {
    list: publicProcedure.query(() => providers.list()),
    create: publicProcedure.input(createProviderInput).mutation(({ input }) => providers.create(input)),
    delete: publicProcedure.input(providerIdInput).mutation(({ input }) => providers.delete(input.providerId)),
  };
}
