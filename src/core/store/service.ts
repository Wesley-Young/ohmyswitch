import { type Context, Service } from 'cordis';
import { z } from 'zod';

import { Store, type StoreData } from './store.ts';

export type { StoreData } from './store.ts';

declare module 'cordis' {
  interface Context {
    store: StoreService;
  }
}

export const storeOptions = z.object({
  /** The directory that holds `store.json`. */
  dataDir: z.string(),
});

export type StoreOptions = z.infer<typeof storeOptions>;

/** The core store registered as `ctx.store`; all logic lives in `store.ts`. */
export class StoreService extends Service {
  static readonly Config = storeOptions;
  private readonly state: Store;

  constructor(ctx: Context, options: StoreOptions) {
    super(ctx, 'store');
    this.state = new Store(options.dataDir);
  }

  async *[Service.init]() {
    await this.state.load();
    // Dependents unload first; this lets the writes they started finish.
    yield () => this.state.idle();
  }

  get data(): Readonly<StoreData> {
    return this.state.data;
  }

  update<T>(mutate: (draft: StoreData) => T): Promise<T> {
    return this.state.update(mutate);
  }
}
