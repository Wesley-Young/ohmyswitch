import { queryClient, trpc } from './trpc';

/** After a provider changes, refresh the provider list, where it is applied, and its icon. */
export const refreshProviders = () =>
  Promise.all([
    queryClient.invalidateQueries(trpc.providers.pathFilter()),
    queryClient.invalidateQueries(trpc.harnesses.pathFilter()),
    // The icon source follows the Base URL and the icon field.
    queryClient.invalidateQueries(trpc.icons.pathFilter()),
  ]);

/** After plugins change, refresh the plugin list and everything that lists harnesses. */
export const refreshPlugins = () =>
  Promise.all([
    queryClient.invalidateQueries(trpc.plugins.pathFilter()),
    queryClient.invalidateQueries(trpc.harnesses.pathFilter()),
    // Provider summaries list the harnesses they are applied to, which only counts enabled ones.
    queryClient.invalidateQueries(trpc.providers.pathFilter()),
  ]);
