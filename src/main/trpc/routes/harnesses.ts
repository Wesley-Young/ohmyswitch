import { applicationInput, applyInput, providerInput, unapplyManyInput } from '#core/harnesses/schemas.ts';
import type { HarnessService } from '#core/harnesses/service.ts';
import { publicProcedure } from '#main/trpc/procedures.ts';

export function harnessRoutes(harnesses: HarnessService) {
  return {
    list: publicProcedure.query(() => harnesses.list()),
    applications: publicProcedure.query(() => harnesses.applications()),
    apply: publicProcedure
      .input(applyInput)
      .mutation(({ input }) => harnesses.apply(input.providerId, input.harnessId, input.replace)),
    applyAll: publicProcedure.input(providerInput).mutation(({ input }) => harnesses.applyAll(input.providerId)),
    unapply: publicProcedure
      .input(applicationInput)
      .mutation(({ input }) => harnesses.unapply(input.providerId, input.harnessId)),
    unapplyMany: publicProcedure
      .input(unapplyManyInput)
      .mutation(({ input }) => harnesses.unapplyMany(input.providerId, input.harnessIds)),
  };
}
