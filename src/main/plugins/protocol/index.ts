import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { HarnessService } from '../../../core/harnesses/service.ts';
import { definePlugin } from '../../../core/kernel.ts';
import { ProviderService } from '../../../core/providers/service.ts';
import { createAppRouter } from '../../trpc/router.ts';
import { type AssetOptions, createAssetHandler } from './assets.ts';
import { appHost, rpcEndpoint } from './scheme.ts';
import { AppProtocol } from './service.ts';

export interface ProtocolOptions extends AssetOptions {
  /** The app version reported by `system.info`. */
  version: string;
}

export const ProtocolPlugin = definePlugin({
  name: 'ohmyswitch-protocol',
  inject: { providers: ProviderService, harnesses: HarnessService },
  provides: [AppProtocol],
  apply(ctx, options: ProtocolOptions) {
    const appRouter = createAppRouter(ctx, options.version);
    const serveAsset = createAssetHandler(options);
    const logger = ctx.logger;

    const handler = async (request: Request) => {
      const url = new URL(request.url);
      if (url.host !== appHost) return new Response('Not Found', { status: 404 });
      if (url.pathname === rpcEndpoint || url.pathname.startsWith(`${rpcEndpoint}/`)) {
        return fetchRequestHandler({
          endpoint: rpcEndpoint,
          req: request,
          router: appRouter,
          createContext: () => ({ logger }),
          onError: ({ error, path }) => {
            if (error.code === 'INTERNAL_SERVER_ERROR') logger.error(`RPC ${path ?? '<unknown>'} failed`, error.cause);
          },
        });
      }
      return serveAsset(request, url);
    };

    ctx.provide(AppProtocol, new AppProtocol(handler));
  },
  // Serve only once every plugin has applied, so no request reaches a half-assembled app.
  start(ctx) {
    ctx.resolve(AppProtocol).listen();
  },
});
