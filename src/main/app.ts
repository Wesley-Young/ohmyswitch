import { Loader } from '@cordisjs/plugin-loader';
import type { Context } from 'cordis';

import { DeepLinkService } from '#core/deep-links/service.ts';
import { DshHarnessPlugin } from '#core/harness-dsh/index.ts';
import { OpenCodeHarnessPlugin } from '#core/harness-opencode/index.ts';
import { PiHarnessPlugin } from '#core/harness-pi/index.ts';
import { HarnessService } from '#core/harnesses/service.ts';
import { IconService } from '#core/icons/service.ts';
import { ModelsDevService } from '#core/models-dev/service.ts';
import { PluginService } from '#core/plugins/service.ts';
import { ProviderService } from '#core/providers/service.ts';
import { StoreService } from '#core/store/service.ts';
import type { AppConfig } from './config.ts';
import { ElectronHttpService } from './plugins/http/service.ts';
import { AppProtocol } from './plugins/protocol/service.ts';
import { WindowService } from './plugins/window/service.ts';

import { join } from 'node:path';

/**
 * The composition root: every plugin gets exactly the configuration it needs here. Plugins start as soon as the
 * services they inject exist, so the order below does not matter. Harnesses are not installed here: they are
 * built-in plugins of `PluginService`, enabled unless `plugins.yml` or `plugins.patch.yml` disables them.
 */
export const App = {
  name: 'ohmyswitch',
  apply(ctx: Context, config: AppConfig) {
    ctx.plugin(ElectronHttpService);
    ctx.plugin(StoreService, { dataDir: config.dirs.data });
    ctx.plugin(ModelsDevService, { cachePath: join(config.dirs.cache, 'models-dev.json') });
    ctx.plugin(IconService, { cacheDir: join(config.dirs.cache, 'icons') });
    ctx.plugin(HarnessService, { home: config.home, env: config.env });
    ctx.plugin(Loader);
    ctx.plugin(PluginService, {
      path: join(config.dirs.config, 'plugins.yml'),
      patchPath: join(config.dirs.config, 'plugins.patch.yml'),
      builtins: [OpenCodeHarnessPlugin, PiHarnessPlugin, DshHarnessPlugin],
    });
    ctx.plugin(ProviderService);
    ctx.plugin(DeepLinkService);
    ctx.plugin(AppProtocol, {
      version: config.version,
      rendererDir: config.rendererDir,
      rendererDevUrl: config.rendererDevUrl,
    });
    ctx.plugin(WindowService);
  },
};
