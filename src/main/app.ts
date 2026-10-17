import { DshHarnessPlugin } from '../core/harness-dsh/index.ts';
import { OpenCodeHarnessPlugin } from '../core/harness-opencode/index.ts';
import { PiHarnessPlugin } from '../core/harness-pi/index.ts';
import { HarnessesPlugin } from '../core/harnesses/index.ts';
import { IconsPlugin } from '../core/icons/index.ts';
import { AppContext } from '../core/kernel.ts';
import { ModelsDevPlugin } from '../core/models-dev/index.ts';
import { ProvidersPlugin } from '../core/providers/index.ts';
import { StorePlugin } from '../core/store/index.ts';
import type { AppConfig } from './config.ts';
import { logHandler } from './logging.ts';
import { HttpPlugin } from './plugins/http/index.ts';
import { ProtocolPlugin } from './plugins/protocol/index.ts';
import { WindowPlugin } from './plugins/window/index.ts';

import { join } from 'node:path';

/** The composition root: every plugin gets exactly the configuration it needs here. */
export function createApp(config: AppConfig) {
  const ctx = AppContext.create();
  ctx.logBus.on('log', logHandler);
  ctx.install(HttpPlugin);
  ctx.install(StorePlugin, { dataDir: config.dataDir });
  ctx.install(ModelsDevPlugin, { cachePath: join(config.dataDir, 'cache', 'models-dev.json') });
  ctx.install(IconsPlugin, { cacheDir: join(config.dataDir, 'cache', 'icons') });
  ctx.install(HarnessesPlugin, { home: config.home, env: config.env });
  // Each harness registers itself; the order here is the order they are listed in.
  ctx.install(OpenCodeHarnessPlugin);
  ctx.install(PiHarnessPlugin);
  ctx.install(DshHarnessPlugin);
  ctx.install(ProvidersPlugin);
  ctx.install(ProtocolPlugin, {
    version: config.version,
    rendererDir: config.rendererDir,
    rendererDevUrl: config.rendererDevUrl,
  });
  ctx.install(WindowPlugin);
  return ctx;
}
