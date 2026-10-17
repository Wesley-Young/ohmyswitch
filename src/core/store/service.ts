import { serviceToken } from '@fraqjs/kernel';

import { Store } from './store.ts';

export type { StoreData } from './store.ts';

/** The core store registered as a kernel service; all logic lives in `store.ts`. */
export class StoreService extends Store {
  static readonly token = serviceToken<StoreService>('ohmyswitch/store');
}
