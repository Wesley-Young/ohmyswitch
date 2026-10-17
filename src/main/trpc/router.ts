import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { HarnessService } from '../../core/harnesses/service.ts';
import type { ProviderService } from '../../core/providers/service.ts';
import { publicProcedure, router } from './procedures.ts';
import { harnessRoutes } from './routes/harnesses.ts';
import { providerRoutes } from './routes/providers.ts';

/** The services behind the routes; the protocol plugin passes its context, which injects them. */
export interface RouterServices {
  providers: ProviderService;
  harnesses: HarnessService;
}

/** Combines every module's routes; this is the complete RPC surface. */
export function createAppRouter(services: RouterServices, version: string) {
  return router({
    system: {
      info: publicProcedure.query(() => ({
        name: 'ohmyswitch',
        version,
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
