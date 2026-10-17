import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { type Context, Service } from 'cordis';
import { protocol } from 'electron';
import { z } from 'zod';

import { createAppRouter } from '#main/trpc/router.ts';
import { createAssetHandler } from './assets.ts';
import { appHost, appOrigin, appScheme, rpcEndpoint } from './scheme.ts';

declare module 'cordis' {
  interface Context {
    protocol: AppProtocol;
  }
}

export const protocolOptions = z.object({
  /** The app version reported by `system.info`. */
  version: z.string(),
  /** Built renderer files, served in production. */
  rendererDir: z.string(),
  /** Vite dev server URL; set in development only. */
  rendererDevUrl: z.string().optional(),
});

export type ProtocolOptions = z.infer<typeof protocolOptions>;

/**
 * Serves app://ohmyswitch: `/api/trpc` goes to the tRPC router, everything else is the renderer. Serving starts
 * once every service behind the routes is ready, so no request reaches a half-assembled app.
 */
export class AppProtocol extends Service {
  static readonly inject = ['providers', 'harnesses', 'icons', 'deepLinks', 'plugins'];
  static readonly Config = protocolOptions;
  /** The origin pages are loaded from. */
  readonly origin = appOrigin;
  private readonly options: ProtocolOptions;

  constructor(ctx: Context, options: ProtocolOptions) {
    super(ctx, 'protocol');
    this.options = options;
  }

  [Service.init]() {
    const { ctx } = this;
    const router = createAppRouter(
      {
        providers: ctx.providers,
        harnesses: ctx.harnesses,
        icons: ctx.icons,
        deepLinks: ctx.deepLinks,
        plugins: ctx.plugins,
      },
      this.options.version,
    );
    const serveAsset = createAssetHandler(this.options);
    const logger = ctx.logger('rpc');

    protocol.handle(appScheme, async (request) => {
      const url = new URL(request.url);
      if (url.host !== appHost) return new Response('Not Found', { status: 404 });
      if (url.pathname === rpcEndpoint || url.pathname.startsWith(`${rpcEndpoint}/`)) {
        return fetchRequestHandler({
          endpoint: rpcEndpoint,
          req: request,
          router,
          createContext: () => ({ logger }),
          onError: ({ error, path }) => {
            if (error.code === 'INTERNAL_SERVER_ERROR') logger.error(`RPC ${path ?? '<unknown>'} failed`, error.cause);
          },
        });
      }
      return serveAsset(request, url);
    });
    return () => protocol.unhandle(appScheme);
  }
}
