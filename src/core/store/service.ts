import { type Context, type Logger, Service } from 'cordis';
import { z } from 'zod';

import { Store, type StoreData } from './store.ts';

import { EventEmitter, on } from 'node:events';

export type { StoreData } from './store.ts';

declare module 'cordis' {
  interface Context {
    store: StoreService;
  }
}

export const storeOptions = z.object({
  /** The directory that holds `store.json`. */
  dataDir: z.string(),
  /**
   * Take in writes by other processes as they happen, for a process that shows the data for long, like the app.
   * Updates read the file again either way.
   */
  watch: z.boolean().optional(),
});

export type StoreOptions = z.infer<typeof storeOptions>;

/** The core store registered as `ctx.store`; all logic lives in `store.ts`. */
export class StoreService extends Service {
  static readonly Config = storeOptions;
  private readonly options: StoreOptions;
  private readonly state: Store;
  private readonly logger: Logger;
  private readonly emitter = new EventEmitter();

  constructor(ctx: Context, options: StoreOptions) {
    super(ctx, 'store');
    this.options = options;
    this.logger = ctx.logger('store');
    this.state = new Store(options.dataDir, { onExternalChange: () => this.emitter.emit('change') });
  }

  async *[Service.init]() {
    await this.state.load();
    if (this.options.watch) {
      yield await this.state.watch((error) => this.logger.warn('Cannot take in %s', this.state.path, error));
    }
    // Dependents unload first; this lets the writes they started finish.
    yield () => this.state.idle();
  }

  get data(): Readonly<StoreData> {
    return this.state.data;
  }

  update<T>(mutate: (draft: StoreData) => T): Promise<T> {
    return this.state.update(mutate);
  }

  /** Fires when another process changed the data. Changes made through `update` here are not reported. */
  async *events(signal: AbortSignal): AsyncGenerator<void> {
    try {
      for await (const _ of on(this.emitter, 'change', { signal })) yield;
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  }
}
