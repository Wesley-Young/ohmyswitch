import { useMutation, useQuery } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { DeleteProviderDialog } from '@/components/delete-provider-dialog';
import { HarnessApplications } from '@/components/harness-applications';
import { PageContent, PageHeader } from '@/components/page';
import { ProviderAvatar } from '@/components/provider-avatar';
import { ProviderModels } from '@/components/provider-models';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { formError, queryClient, trpc } from '@/lib/trpc';

export default function ProviderDetail() {
  const { providerId = '' } = useParams();
  const navigate = useNavigate();
  const provider = useQuery(trpc.providers.get.queryOptions({ providerId }));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const refreshIcon = useMutation(
    trpc.icons.refresh.mutationOptions({
      onSuccess: async ({ found }, input) => {
        await queryClient.invalidateQueries(trpc.icons.get.queryFilter(input));
        if (found) toast.success('已刷新图标');
        else toast.warning('没有找到图标，可以在编辑中指定');
      },
      onError: (error) => toast.error(formError(error)?.message),
    }),
  );

  if (provider.isPending) return <DetailSkeleton />;
  if (provider.isError) {
    const notFound = provider.error instanceof TRPCClientError && provider.error.data?.code === 'NOT_FOUND';
    return (
      <PageContent>
        <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm">
          <span className="text-destructive">{formError(provider.error)?.message}</span>
          {!notFound && (
            <Button variant="outline" size="sm" onClick={() => provider.refetch()}>
              重试
            </Button>
          )}
        </div>
      </PageContent>
    );
  }

  const { data } = provider;
  return (
    <>
      <PageHeader
        title={data.name}
        icon={<ProviderAvatar providerId={data.id} name={data.name} endpoint={data.endpoint} size="lg" />}
        actions={
          <>
            <Button nativeButton={false} render={<Link to={`/providers/${data.id}/edit`} />}>
              编辑
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="更多操作" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={refreshIcon.isPending}
                  onClick={() => refreshIcon.mutate({ providerId: data.id })}
                >
                  <RefreshCw className={refreshIcon.isPending ? 'animate-spin' : undefined} />
                  刷新图标
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <div className="truncate font-mono text-xs text-muted-foreground" title={`${data.baseUrl}${data.endpoint}`}>
          {data.baseUrl}
          <span className="text-foreground">{data.endpoint}</span>
        </div>
      </PageHeader>
      <PageContent>
        {/* Keyed on the provider so switching providers remounts both sections with fresh local state. */}
        <div key={data.id} className="grid gap-8">
          <HarnessApplications providerId={data.id} endpoint={data.endpoint} />
          <ProviderModels
            providerId={data.id}
            providerName={data.name}
            models={data.models}
            effectiveModels={data.effectiveModels}
            inheritedModels={data.inheritedModels}
            modelOverrides={data.modelOverrides}
            globalModelOverrides={data.globalModelOverrides}
          />
        </div>
      </PageContent>
      <DeleteProviderDialog
        provider={data}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate('/providers', { replace: true })}
      />
    </>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-8 pt-8 pb-6">
          <Skeleton className="size-12 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      </div>
      <PageContent>
        <Skeleton className="h-36 w-full rounded-lg" />
      </PageContent>
    </>
  );
}
