import type { AppConfig } from './config.ts';
import { AppContext } from './kernel.ts';
import { logHandler } from './logging.ts';
import { HarnessesPlugin } from './plugins/harnesses/index.ts';
import { ProtocolPlugin } from './plugins/protocol/index.ts';
import { ProvidersPlugin } from './plugins/providers/index.ts';
import { StorePlugin } from './plugins/store/index.ts';

export function createApp(config: AppConfig) {
  const ctx = AppContext.create(config);
  ctx.logBus.on('log', logHandler);
  ctx.install(StorePlugin);
  ctx.install(HarnessesPlugin);
  ctx.install(ProvidersPlugin);
  ctx.install(ProtocolPlugin);
  return ctx;
}
