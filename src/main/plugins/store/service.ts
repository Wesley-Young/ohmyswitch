import { serviceToken } from '@fraqjs/kernel';

import { Store } from '../../../core/store.ts';

export type { StoreData } from '../../../core/store.ts';

/** The core store registered as a kernel service; all logic lives in `core/store.ts`. */
export class StoreService extends Store {
  static readonly token = serviceToken<StoreService>('ohmyswitch/store');
}
