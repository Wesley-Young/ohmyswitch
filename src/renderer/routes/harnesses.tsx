import { useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { ArrowUpRight } from 'lucide-react';

import { HarnessIcon } from '@/components/harness-icon';
import { PageContent, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formError, trpc } from '@/lib/trpc';

export default function Harnesses() {
  const harnesses = useQuery(trpc.harnesses.list.queryOptions(undefined, { staleTime: 0 }));
  return (
    <>
      <PageHeader title="Harness" />
      <PageContent>
        {harnesses.isPending ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : harnesses.isError ? (
          <div className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
            <span className="text-destructive">{formError(harnesses.error)?.message}</span>
            <Button variant="outline" size="sm" onClick={() => harnesses.refetch()}>
              重试
            </Button>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {harnesses.data.map((harness) => (
              <li key={harness.id} className="flex items-center gap-4 px-4 py-3">
                <HarnessIcon id={harness.id} />
                <div className="min-w-0 flex-1">
                  <a
                    href={harness.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-sm font-medium hover:underline"
                  >
                    {harness.name}
                    <ArrowUpRight className="size-3.5 text-muted-foreground" />
                  </a>
                  <div className="truncate font-mono text-xs text-muted-foreground" title={harness.configPath}>
                    {harness.configPath}
                  </div>
                </div>
                {!harness.supported && (
                  <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                    暂不支持
                  </Badge>
                )}
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn('size-2 rounded-full', harness.detected ? 'bg-success' : 'bg-muted-foreground/40')}
                  />
                  {harness.detected ? '已安装' : '未发现 Harness'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PageContent>
    </>
  );
}
