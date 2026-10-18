import { Context, type Exporter, Logger } from 'cordis';

import { FiberState } from '#core/cordis.ts';
import type {} from '#core/harnesses/service.ts';
import type {} from '#core/plugins/service.ts';
import type {} from '#core/providers/service.ts';
import type {} from '#core/store/service.ts';
import { App } from './app.ts';
import type { CliConfig } from './config.ts';

import { setTimeout as delay } from 'node:timers/promises';
import { inspect } from 'node:util';

export interface Runtime {
  ctx: Context;
  dispose(): Promise<void>;
}

const describe = (value: unknown) =>
  value instanceof Error ? (value.stack ?? value.message) : inspect(value, { depth: 4, breakLength: Infinity });

/** Logs go to stderr with `--verbose` and nowhere otherwise: the CLI does not write the GUI's log file. */
function exporter(verbose: boolean): Exporter {
  const result: Exporter = {
    colors: false,
    formatters: { o: describe, O: describe },
    export(message) {
      if (!verbose) return;
      process.stderr.write(`${message.type.toUpperCase()} [${message.name}] ${Logger.format(result, message)}\n`);
    },
  };
  return result;
}

/** How long to wait for the harness plugins to finish loading before running anyway. */
const settleTimeoutMs = 5000;

/** Wait until no plugin of `plugins.yml` is still loading, so every enabled harness is registered. */
async function settle(ctx: Context) {
  const deadline = Date.now() + settleTimeoutMs;
  while (Date.now() < deadline) {
    const { entries } = await ctx.plugins.list();
    if (!entries.some((entry) => entry.state === 'loading' || entry.state === 'pending')) return;
    await delay(10);
  }
}

/**
 * Start the core services and resolve once they and the harness plugins are ready. A core plugin failing, such
 * as on an unreadable `store.json`, rejects with its error.
 */
export function boot(config: CliConfig, verbose: boolean): Promise<Runtime> {
  const root = new Context();
  root.logger.exporter(exporter(verbose));
  return new Promise<Runtime>((resolve, reject) => {
    let settled = false;
    const fiber = root.plugin({
      name: 'oms',
      apply(ctx: Context) {
        ctx.on('internal/status', (child) => {
          if (child.state !== FiberState.FAILED || child.entry || settled) return;
          settled = true;
          child.await().catch((error: unknown) => {
            void fiber.dispose().catch(() => {});
            reject(error);
          });
        });
        ctx.plugin(App, config);
        ctx.inject(['store', 'harnesses', 'plugins', 'providers'], (ctx) => {
          settle(ctx).then(
            () => {
              settled = true;
              resolve({ ctx, dispose: () => fiber.dispose().then(() => {}) });
            },
            (error: unknown) => {
              settled = true;
              reject(error);
            },
          );
        });
      },
    });
  });
}
