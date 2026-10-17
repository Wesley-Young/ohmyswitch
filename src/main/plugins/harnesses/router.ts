import { publicProcedure } from '../../trpc/procedures.ts';
import { applicationInput, applyInput } from './schemas.ts';
import type { HarnessService } from './service.ts';

export function harnessRoutes(harnesses: HarnessService) {
  return {
    list: publicProcedure.query(() => harnesses.list()),
    applications: publicProcedure.query(() => harnesses.applications()),
    apply: publicProcedure
      .input(applyInput)
      .mutation(({ input }) => harnesses.apply(input.providerId, input.harnessId, input.replace)),
    unapply: publicProcedure
      .input(applicationInput)
      .mutation(({ input }) => harnesses.unapply(input.providerId, input.harnessId)),
  };
}
