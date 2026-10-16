import { publicProcedure } from '../../trpc/procedures.ts';
import type { HarnessService } from './service.ts';

export function harnessRoutes(harnesses: HarnessService) {
  return {
    list: publicProcedure.query(() => harnesses.list()),
  };
}
