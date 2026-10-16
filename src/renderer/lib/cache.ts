import { queryClient, trpc } from './trpc';

/** After a provider changes, refresh the provider list. */
export const refreshProviders = () => queryClient.invalidateQueries(trpc.providers.pathFilter());
