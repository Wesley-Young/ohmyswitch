import { queryClient, trpc } from './trpc';

/** After a provider changes, refresh the provider list, where it is applied, and its icon. */
export const refreshProviders = () =>
  Promise.all([
    queryClient.invalidateQueries(trpc.providers.pathFilter()),
    queryClient.invalidateQueries(trpc.harnesses.pathFilter()),
    // The icon source follows the Base URL and the icon field.
    queryClient.invalidateQueries(trpc.icons.pathFilter()),
  ]);
