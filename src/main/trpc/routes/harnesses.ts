import { applicationInput, applyInput } from '../../../core/harnesses/schemas.ts';
import type { HarnessService } from '../../../core/harnesses/service.ts';
import { publicProcedure } from '../procedures.ts';

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
