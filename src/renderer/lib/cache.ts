import { queryClient, trpc } from './trpc';

/** After a provider changes, refresh the provider list and where it is applied. */
export const refreshProviders = () =>
  Promise.all([
    queryClient.invalidateQueries(trpc.providers.pathFilter()),
    queryClient.invalidateQueries(trpc.harnesses.pathFilter()),
  ]);
