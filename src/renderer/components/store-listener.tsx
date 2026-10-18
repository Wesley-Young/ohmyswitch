import { useSubscription } from '@trpc/tanstack-react-query';

import { refreshStore } from '@/lib/cache';
import { trpc } from '@/lib/trpc';

/** Keeps providers current when another process, such as the oms CLI, changes them. */
export function StoreListener() {
  useSubscription(trpc.store.events.subscriptionOptions(undefined, { onData: () => void refreshStore() }));
  return null;
}
