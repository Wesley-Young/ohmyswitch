import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import { harnessRoutes } from '../plugins/harnesses/router.ts';
import type { HarnessService } from '../plugins/harnesses/service.ts';
import { providerRoutes } from '../plugins/providers/router.ts';
import type { ProviderService } from '../plugins/providers/service.ts';
import { publicProcedure, router } from './procedures.ts';

export interface RouterServices {
  version: string;
  providers: ProviderService;
  harnesses: HarnessService;
}

/** Combines every module's routes; this is the complete RPC surface. */
export function createAppRouter(services: RouterServices) {
  return router({
    system: {
      info: publicProcedure.query(() => ({
        name: 'ohmyswitch',
        version: services.version,
        platform: process.platform,
      })),
    },
    providers: providerRoutes(services.providers),
    harnesses: harnessRoutes(services.harnesses),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
