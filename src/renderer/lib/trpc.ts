import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';

// The only renderer file allowed to reach into the main process, and only for types.
import type { AppRouter } from '../../main/trpc/router.ts';

export type { RouterInputs, RouterOutputs } from '../../main/trpc/router.ts';

/** The page is served from app://ohmyswitch, so the relative URL reaches the main process handler. */
export const trpcClient = createTRPCClient<AppRouter>({
  links: [httpLink({ url: '/api/trpc' })],
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => count < 1 && !(error instanceof TRPCClientError),
    },
    mutations: { retry: false, gcTime: 0 },
  },
});

export const trpc = createTRPCOptionsProxy<AppRouter>({ client: trpcClient, queryClient });

/** The user-facing message and per-field messages of a failed request. */
export function formError(error: unknown) {
  if (!error) return undefined;
  if (error instanceof TRPCClientError) {
    const rpc = error as TRPCClientError<AppRouter>;
    return { message: rpc.message, fields: rpc.data?.fieldErrors ?? {} };
  }
  return {
    message: error instanceof Error ? error.message : '操作失败，请稍后重试',
    fields: {} as Record<string, string[]>,
  };
}
