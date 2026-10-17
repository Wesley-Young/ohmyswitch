import { useMutation, useQuery } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { FormSkeleton } from '@/components/form-skeleton';
import { useHarnessFeedback } from '@/components/harness-feedback';
import { PageContent, PageHeader } from '@/components/page';
import { ProviderForm, toPayload } from '@/components/provider-form';
import { Button } from '@/components/ui/button';
import { refreshProviders } from '@/lib/cache';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type Connection = RouterOutputs['providers']['connection'];

export default function ProviderEdit() {
  const { providerId = '' } = useParams();
  const provider = useQuery(trpc.providers.connection.queryOptions({ providerId }, { staleTime: 0 }));
  const notFound = provider.error instanceof TRPCClientError && provider.error.data?.code === 'NOT_FOUND';

  return (
    <>
      <PageHeader title="编辑供应商" backTo={`/providers/${providerId}`} />
      <PageContent>
        {provider.isPending ? (
          <FormSkeleton />
        ) : provider.isError ? (
          <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm">
            <span className="text-destructive">{formError(provider.error)?.message}</span>
            {notFound ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/providers" />}>
                返回供应商
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => provider.refetch()}>
                重试
              </Button>
            )}
          </div>
        ) : (
          <EditProviderForm key={providerId} providerId={providerId} connection={provider.data} />
        )}
      </PageContent>
    </>
  );
}

/** Keyed by provider id, so the form state is initialized once from the loaded provider. */
function EditProviderForm({ providerId, connection }: { providerId: string; connection: Connection }) {
  const navigate = useNavigate();
  const report = useHarnessFeedback();
  const update = useMutation(
    trpc.providers.update.mutationOptions({
      onSuccess: async (saved) => {
        await refreshProviders();
        report(`已保存「${saved.name}」`, saved);
        // Models fetched for the old protocol may not be served on the new one.
        if (saved.endpoint !== connection.endpoint && saved.modelCount > 0) {
          toast.warning('端点已变更，建议重新获取模型');
        }
        navigate(`/providers/${saved.id}`);
      },
    }),
  );

  return (
    <ProviderForm
      cancelTo={`/providers/${providerId}`}
      initialValues={connection}
      submitLabel="保存"
      pendingLabel="正在保存…"
      isPending={update.isPending}
      error={update.error}
      onSubmit={(values) => update.mutate({ providerId, ...toPayload(values) })}
    />
  );
}
