import { useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { NavLink } from 'react-router';

import { HarnessGlyph } from '@/components/harness-icon';
import { ProviderAvatar } from '@/components/provider-avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formError, type RouterOutputs, trpc } from '@/lib/trpc';

type Provider = RouterOutputs['providers']['list'][number];
type Application = RouterOutputs['harnesses']['applications'][string][number];

/** The left column: every provider, the selected one highlighted. */
export function ProviderList() {
  const providers = useQuery(trpc.providers.list.queryOptions());
  // Harness configs can change outside ohmyswitch, so their state is always read fresh.
  const applications = useQuery(trpc.harnesses.applications.queryOptions(undefined, { staleTime: 0 }));
  const info = useQuery(trpc.system.info.queryOptions(undefined, { staleTime: Number.POSITIVE_INFINITY }));

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <nav aria-label="供应商" className="min-h-0 flex-1 overflow-y-auto p-2">
        {providers.isPending ? (
          <ListSkeleton />
        ) : providers.isError ? (
          <div className="grid gap-2 p-2 text-sm">
            <span className="text-destructive">{formError(providers.error)?.message}</span>
            <Button variant="outline" size="sm" className="justify-self-start" onClick={() => providers.refetch()}>
              重试
            </Button>
          </div>
        ) : (
          // A grid column sizes to its widest item by default; minmax(0, 1fr) keeps items at the column width so
          // long names truncate instead of scrolling the column sideways.
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
            {providers.data.map((provider) => (
              <li key={provider.id}>
                <ProviderItem provider={provider} applications={applications.data?.[provider.id] ?? []} />
              </li>
            ))}
          </ul>
        )}
      </nav>
      <div className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {info.data ? `v${info.data.version}` : '\u00a0'}
      </div>
    </aside>
  );
}

function ProviderItem({ provider, applications }: { provider: Provider; applications: Application[] }) {
  return (
    <NavLink
      to={`/providers/${provider.id}`}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-sidebar-accent',
          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
        )
      }
    >
      <ProviderAvatar name={provider.name} endpoint={provider.endpoint} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{provider.name}</span>
          {applications.length > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
              {applications.map((application) => (
                <span
                  key={application.harnessId}
                  className={cn(
                    'flex',
                    // A harness whose config is out of sync is shown in the problem color.
                    application.state !== 'applied' && 'text-destructive',
                  )}
                >
                  <HarnessGlyph id={application.harnessId} size={12} />
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{statusOf(provider)}</div>
      </div>
    </NavLink>
  );
}

/** The item's second line: a short status for the provider. */
const statusOf = (provider: Provider) =>
  provider.modelCount ? `${provider.modelCount} 个模型` : '尚未配置模型';

function ListSkeleton() {
  return (
    <div className="grid gap-0.5">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex items-center gap-3 px-2.5 py-2.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
