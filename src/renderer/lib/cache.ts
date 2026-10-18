import { queryClient, trpc } from './trpc';

/**
 * After a provider changes, refresh the provider list, where it is applied, its icon, and what changed in its
 * model list. The service compares with a recent copy of the list, and asks the provider again only for a new
 * connection, so this costs no request to the provider.
 */
export const refreshProviders = () =>
  Promise.all([
    queryClient.invalidateQueries(trpc.providers.pathFilter()),
    queryClient.invalidateQueries(trpc.harnesses.pathFilter()),
    // The icon source follows the Base URL and the icon field.
    queryClient.invalidateQueries(trpc.icons.pathFilter()),
  ]);

/**
 * After the provider's model list was fetched, which also records it as reviewed: reload the provider for the
 * recorded list, and what changed against the fetched one.
 */
export const refreshFetchedModels = (providerId: string) =>
  Promise.all([
    queryClient.invalidateQueries(trpc.providers.get.queryFilter({ providerId })),
    queryClient.invalidateQueries(trpc.providers.modelChanges.queryFilter({ providerId })),
  ]);

/**
 * After another process, such as the CLI, changed the data: refresh what a provider change refreshes, and the
 * pending import, which is matched against the saved providers.
 */
export const refreshStore = () =>
  Promise.all([refreshProviders(), queryClient.invalidateQueries(trpc.deepLinks.pending.queryFilter())]);

/** After plugins change, refresh the plugin list and everything that lists harnesses. */
export const refreshPlugins = () =>
  Promise.all([
    queryClient.invalidateQueries(trpc.plugins.pathFilter()),
    queryClient.invalidateQueries(trpc.harnesses.pathFilter()),
    // Provider summaries list the harnesses they are applied to, which only counts enabled ones; what can be
    // imported depends on them too.
    queryClient.invalidateQueries(trpc.providers.pathFilter()),
  ]);
