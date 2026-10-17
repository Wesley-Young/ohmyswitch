import { publicProcedure } from '../../trpc/procedures.ts';
import {
  createProviderInput,
  providerIdInput,
  providerSourceInput,
  syncModelsInput,
  updateProviderInput,
} from './schemas.ts';
import type { ProviderService } from './service.ts';

export function providerRoutes(providers: ProviderService) {
  return {
    list: publicProcedure.query(() => providers.list()),
    get: publicProcedure.input(providerIdInput).query(({ input }) => providers.get(input.providerId)),
    update: publicProcedure.input(updateProviderInput).mutation(({ input }) => providers.update(input)),
    // A mutation rather than a query so the API key travels in the request body, not the URL.
    fetchModels: publicProcedure.input(providerSourceInput).mutation(({ input }) => providers.fetchModels(input)),
    syncModels: publicProcedure.input(syncModelsInput).mutation(({ input }) => providers.syncModels(input)),
    create: publicProcedure.input(createProviderInput).mutation(({ input }) => providers.create(input)),
    delete: publicProcedure.input(providerIdInput).mutation(({ input }) => providers.delete(input.providerId)),
  };
}
