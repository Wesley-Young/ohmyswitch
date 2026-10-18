import { Loader } from '@cordisjs/plugin-loader';
import type { Context } from 'cordis';

import { HarnessService } from '#core/harnesses/service.ts';
import { IconService } from '#core/icons/service.ts';
import { ModelsDevService } from '#core/models-dev/service.ts';
import { builtinPlugins } from '#core/plugins/builtins.ts';
import { PluginService } from '#core/plugins/service.ts';
import { ProviderService } from '#core/providers/service.ts';
import { StoreService } from '#core/store/service.ts';
import type { CliConfig } from './config.ts';
import { NodeHttpService } from './http.ts';

import { join } from 'node:path';

/**
 * The CLI's composition root, the counterpart of `main/app.ts` without the Electron plugins: the same core
 * services over the same files, with `ctx.http` on Node's fetch.
 */
export const App = {
  name: 'ohmyswitch',
  apply(ctx: Context, config: CliConfig) {
    ctx.plugin(NodeHttpService);
    ctx.plugin(StoreService, { dataDir: config.dirs.data });
    ctx.plugin(ModelsDevService, { cachePath: join(config.dirs.cache, 'models-dev.json') });
    ctx.plugin(IconService, { cacheDir: join(config.dirs.cache, 'icons') });
    ctx.plugin(HarnessService, { home: config.home, env: config.env });
    ctx.plugin(Loader);
    ctx.plugin(PluginService, {
      path: join(config.dirs.config, 'plugins.yml'),
      patchPath: join(config.dirs.config, 'plugins.patch.yml'),
      builtins: builtinPlugins,
    });
    ctx.plugin(ProviderService);
  },
};
