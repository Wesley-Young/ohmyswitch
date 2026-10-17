import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { DeepLinkService } from '#core/deep-links/service.ts';
import type { HarnessService } from '#core/harnesses/service.ts';
import type { IconService } from '#core/icons/service.ts';
import type { PluginService } from '#core/plugins/service.ts';
import type { ProviderService } from '#core/providers/service.ts';
import { publicProcedure, router } from './procedures.ts';
import { deepLinkRoutes } from './routes/deep-links.ts';
import { harnessRoutes } from './routes/harnesses.ts';
import { iconRoutes } from './routes/icons.ts';
import { pluginRoutes } from './routes/plugins.ts';
import { providerRoutes } from './routes/providers.ts';

/** The services behind the routes; the protocol plugin, which injects them, passes them in. */
export interface RouterServices {
  providers: ProviderService;
  harnesses: HarnessService;
  icons: IconService;
  deepLinks: DeepLinkService;
  plugins: PluginService;
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
    icons: iconRoutes(services.icons),
    deepLinks: deepLinkRoutes(services.deepLinks),
    plugins: pluginRoutes(services.plugins),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
