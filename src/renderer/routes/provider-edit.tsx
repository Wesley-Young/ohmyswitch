import { useMutation, useQuery } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { PageContent, PageHeader } from '@/components/page';
import { ProviderForm, toPayload } from '@/components/provider-form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { refreshProviders } from '@/lib/cache';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type ProviderDetail = RouterOutputs['providers']['get'];

export default function ProviderEdit() {
  const { providerId = '' } = useParams();
  const provider = useQuery(trpc.providers.get.queryOptions({ providerId }, { staleTime: 0 }));
  const notFound = provider.error instanceof TRPCClientError && provider.error.data?.code === 'NOT_FOUND';

  return (
    <>
      <PageHeader title="编辑供应商" backTo="/providers" />
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
          <EditProviderForm key={provider.data.id} provider={provider.data} />
        )}
      </PageContent>
    </>
  );
}

/** Keyed by provider id, so the form state is initialized once from the loaded provider. */
function EditProviderForm({ provider }: { provider: ProviderDetail }) {
  const navigate = useNavigate();
  const harnesses = useQuery(trpc.harnesses.list.queryOptions());
  const nameOf = (harnessId: string) => harnesses.data?.find((harness) => harness.id === harnessId)?.name ?? harnessId;
  const update = useMutation(
    trpc.providers.update.mutationOptions({
      onSuccess: async (saved) => {
        await refreshProviders();
        const failed = new Set(saved.harnessFailures.map((failure) => failure.harnessId));
        const updated = saved.harnesses.filter((harnessId) => !failed.has(harnessId)).map(nameOf);
        toast.success(
          updated.length ? `已保存「${saved.name}」，并更新了 ${updated.join('、')}` : `已保存「${saved.name}」`,
        );
        for (const failure of saved.harnessFailures) {
          toast.error(`未能更新 ${nameOf(failure.harnessId)}：${failure.message}`);
        }
        navigate('/providers');
      },
    }),
  );

  return (
    <ProviderForm
      initialValues={{
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        endpoint: provider.endpoint,
        models: provider.models,
      }}
      submitLabel="保存"
      pendingLabel="正在保存…"
      isPending={update.isPending}
      error={update.error}
      onSubmit={(values) => update.mutate({ providerId: provider.id, ...toPayload(values) })}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="grid max-w-md gap-6">
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid gap-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}
