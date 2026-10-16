import { type Disposable, serviceToken } from '@fraqjs/kernel';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { protocol } from 'electron';

import { definePlugin } from '../../kernel.ts';
import { createAppRouter } from '../../trpc/router.ts';
import { HarnessService } from '../harnesses/service.ts';
import { ProviderService } from '../providers/service.ts';
import { createAssetHandler } from './assets.ts';
import { appHost, appScheme, rpcEndpoint } from './scheme.ts';

/** Owns the app:// handler for the lifetime of the context. */
export class AppProtocol implements Disposable {
  static readonly token = serviceToken<AppProtocol>('ohmyswitch/protocol');

  constructor(handler: (request: Request) => Promise<Response>) {
    protocol.handle(appScheme, handler);
  }

  dispose() {
    protocol.unhandle(appScheme);
  }
}

export const ProtocolPlugin = definePlugin({
  name: 'ohmyswitch-protocol',
  inject: { providers: ProviderService, harnesses: HarnessService },
  provides: [AppProtocol],
  apply(ctx) {
    const appRouter = createAppRouter({
      version: ctx.config.version,
      providers: ctx.providers,
      harnesses: ctx.harnesses,
    });
    const serveAsset = createAssetHandler(ctx.config);
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
});
