import { useSubscription } from '@trpc/tanstack-react-query';

import { refreshPlugins } from '@/lib/cache';
import { trpc } from '@/lib/trpc';

/** Keeps every harness list current when plugins change, including edits of plugins.yml outside ohmyswitch. */
export function PluginListener() {
  useSubscription(trpc.plugins.events.subscriptionOptions(undefined, { onData: () => void refreshPlugins() }));
  return null;
}
