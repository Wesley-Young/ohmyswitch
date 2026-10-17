import { useQuery } from '@tanstack/react-query';
import { KeyRound, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { DeleteProviderDialog } from '@/components/delete-provider-dialog';
import { PageContent, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { endpointLabels } from '@/lib/endpoints';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type Provider = RouterOutputs['providers']['list'][number];

export default function Providers() {
  const providers = useQuery(trpc.providers.list.queryOptions());
  const [deleting, setDeleting] = useState<Provider>();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const addButton = (
    <Button nativeButton={false} render={<Link to="/providers/new" />}>
      <Plus data-icon="inline-start" />
      添加供应商
    </Button>
  );

  return (
    <>
      <PageHeader title="供应商" actions={providers.data?.length ? addButton : undefined} />
      <PageContent>
        {providers.isPending ? (
          <ListSkeleton />
        ) : providers.isError ? (
          <div className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
            <span className="text-destructive">{formError(providers.error)?.message}</span>
            <Button variant="outline" size="sm" onClick={() => providers.refetch()}>
              重试
            </Button>
          </div>
        ) : providers.data.length === 0 ? (
          <Empty className="border py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRound />
              </EmptyMedia>
              <EmptyTitle>还没有供应商</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>{addButton}</EmptyContent>
          </Empty>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {providers.data.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                onDelete={() => {
                  setDeleting(provider);
                  setConfirmOpen(true);
                }}
              />
            ))}
          </ul>
        )}
      </PageContent>
      <DeleteProviderDialog provider={deleting} open={confirmOpen} onOpenChange={setConfirmOpen} />
    </>
  );
}

function ProviderRow({ provider, onDelete }: { provider: Provider; onDelete: () => void }) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium uppercase">
        {provider.name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{provider.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">{provider.accessPoints[0]?.baseUrl}</div>
      </div>
      <div className="hidden shrink-0 gap-1 md:flex">
        {provider.modelCount > 0 && (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {provider.modelCount} 个模型
          </Badge>
        )}
        <Badge variant="outline" className="font-normal text-muted-foreground">
          {endpointLabels[provider.endpoint]}
        </Badge>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="编辑"
          title="编辑"
          nativeButton={false}
          render={<Link to={`/providers/${provider.id}`} />}
        >
          <Pencil />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="更多操作" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y rounded-lg border">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      ))}
    </div>
  );
}
