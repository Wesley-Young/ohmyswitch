import {
  createProviderInput,
  providerIdInput,
  reorderInput,
  reviewModelsInput,
  setModelsInput,
  updateProviderInput,
} from '#core/providers/schemas.ts';
import type { ProviderService } from '#core/providers/service.ts';
import { publicProcedure } from '#main/trpc/procedures.ts';

export function providerRoutes(providers: ProviderService) {
  return {
    list: publicProcedure.query(() => providers.list()),
    get: publicProcedure.input(providerIdInput).query(({ input }) => providers.get(input.providerId)),
    connection: publicProcedure.input(providerIdInput).query(({ input }) => providers.connection(input.providerId)),
    create: publicProcedure.input(createProviderInput).mutation(({ input }) => providers.create(input)),
    update: publicProcedure.input(updateProviderInput).mutation(({ input }) => providers.update(input)),
    delete: publicProcedure.input(providerIdInput).mutation(({ input }) => providers.delete(input.providerId)),
    reorder: publicProcedure.input(reorderInput).mutation(({ input }) => providers.reorder(input)),
    // A mutation: it reaches out to the provider and should run only when asked.
    fetchModels: publicProcedure
      .input(providerIdInput)
      .mutation(({ input }) => providers.fetchModels(input.providerId)),
    // A query: the provider page checks the list in the background to offer what changed.
    remoteModels: publicProcedure.input(providerIdInput).query(({ input }) => providers.remoteModels(input.providerId)),
    setModels: publicProcedure.input(setModelsInput).mutation(({ input }) => providers.setModels(input)),
    reviewModels: publicProcedure.input(reviewModelsInput).mutation(({ input }) => providers.reviewModels(input)),
    syncModels: publicProcedure.input(providerIdInput).mutation(({ input }) => providers.syncModels(input.providerId)),
  };
}
