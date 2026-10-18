import type { Context } from 'cordis';

import type { CliConfig } from './config.ts';
import type { Globals } from './framework/argv.ts';
import type { Session } from './framework/command.ts';
import type { Output } from './framework/output.ts';
import { boot, type Runtime } from './runtime.ts';

/** Whether prompting is possible: both ends are a terminal, outside CI, and the user did not rule it out. */
export function canPrompt(globals: Globals, env: CliConfig['env']) {
  if (globals.json || globals['no-input']) return false;
  if (env.CI && env.CI !== 'false' && env.CI !== '0') return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export class CliSession implements Session {
  readonly config: CliConfig;
  readonly out: Output;
  readonly interactive: boolean;
  readonly json: boolean;
  readonly yes: boolean;
  private readonly verbose: boolean;
  private runtime: Promise<Runtime> | undefined;

  constructor(config: CliConfig, out: Output, globals: Globals) {
    this.config = config;
    this.out = out;
    this.interactive = canPrompt(globals, config.env);
    this.json = globals.json;
    this.yes = globals.yes;
    this.verbose = globals.verbose;
  }

  async services(): Promise<Context> {
    this.runtime ??= boot(this.config, this.verbose);
    return (await this.runtime).ctx;
  }

  async reset() {
    const runtime = this.runtime;
    this.runtime = undefined;
    if (!runtime) return;
    const started = await runtime.catch(() => undefined);
    await started?.dispose();
  }
}
