import { useQuery } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { formError, trpc } from '@/lib/trpc';

export default function ProviderDetail() {
  const { providerId = '' } = useParams();
  const navigate = useNavigate();
  const provider = useQuery(trpc.providers.get.queryOptions({ providerId }));
  const [deleteOpen, setDeleteOpen] = useState(false);

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
        icon={<ProviderAvatar name={data.name} endpoint={data.endpoint} size="lg" />}
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
        <div className="grid gap-8">
          <section className="grid gap-3" aria-labelledby="applications-title">
            <h2 id="applications-title" className="text-sm font-medium">
              应用到
            </h2>
            <HarnessApplications key={data.id} providerId={data.id} endpoint={data.endpoint} />
          </section>
          <ProviderModels key={data.id} providerId={data.id} providerName={data.name} models={data.models} />
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
          <Skeleton className="size-12 rounded-full" />
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
