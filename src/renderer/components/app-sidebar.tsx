import { useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { ArrowLeftRight, Boxes, KeyRound } from 'lucide-react';
import { NavLink } from 'react-router';

import { isMac } from '@/lib/platform';
import { trpc } from '@/lib/trpc';

const items = [
  { to: '/providers', label: '供应商', icon: KeyRound },
  { to: '/harnesses', label: 'Harness', icon: Boxes },
];

export function AppSidebar() {
  const info = useQuery(trpc.system.info.queryOptions(undefined, { staleTime: Number.POSITIVE_INFINITY }));
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground select-none">
      <div className={cn('app-drag flex h-12 items-center gap-2 px-4', isMac && 'pl-21')}>
        <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-background">
          <ArrowLeftRight className="size-3" strokeWidth={2.5} />
        </span>
        <span className="text-sm font-semibold tracking-tight">ohmyswitch</span>
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pt-2">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-4 py-3 font-mono text-xs text-muted-foreground">
        {info.data ? `v${info.data.version}` : '\u00a0'}
      </div>
    </aside>
  );
}
