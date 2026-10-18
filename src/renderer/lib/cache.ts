import { matchQuery } from '@tanstack/react-query';

import type { Model } from './models';
import { queryClient, trpc } from './trpc';

/**
 * Provider queries answered from ohmyswitch's own data. The models a provider lists are fetched from the provider
 * itself, and only a new connection changes them.
 */
const savedProviderData = {
  ...trpc.providers.pathFilter(),
  predicate: (query: Parameters<typeof matchQuery>[1]) => !matchQuery(trpc.providers.remoteModels.pathFilter(), query),
};

/** After a provider changes, refresh the provider list, where it is applied, and its icon. */
export const refreshProviders = () =>
  Promise.all([
    queryClient.invalidateQueries(savedProviderData),
    queryClient.invalidateQueries(trpc.harnesses.pathFilter()),
    // The icon source follows the Base URL and the icon field.
    queryClient.invalidateQueries(trpc.icons.pathFilter()),
  ]);

/** After a provider's connection changes, also ask it again which models it lists. */
export const refreshConnection = (providerId: string) =>
  Promise.all([
    refreshProviders(),
    queryClient.invalidateQueries(trpc.providers.remoteModels.queryFilter({ providerId })),
  ]);

/**
 * After the provider's model list was fetched, which also records it as reviewed: keep it for the background
 * comparison, and reload the provider for the recorded list.
 */
export const refreshFetchedModels = (providerId: string, models: Model[]) => {
  queryClient.setQueryData(trpc.providers.remoteModels.queryKey({ providerId }), { models });
  return queryClient.invalidateQueries(trpc.providers.get.queryFilter({ providerId }));
};

/** After plugins change, refresh the plugin list and everything that lists harnesses. */
export const refreshPlugins = () =>
  Promise.all([
    queryClient.invalidateQueries(trpc.plugins.pathFilter()),
    queryClient.invalidateQueries(trpc.harnesses.pathFilter()),
    // Provider summaries list the harnesses they are applied to, which only counts enabled ones.
    queryClient.invalidateQueries(savedProviderData),
  ]);
