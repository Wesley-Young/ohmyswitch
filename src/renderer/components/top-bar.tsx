import { cn } from 'cn';
import { ArrowLeftRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { isMac } from '@/lib/platform';

/**
 * The window title bar across the full width. It is the drag region; actions opt out of dragging. On macOS the
 * traffic lights sit at its left edge.
 */
export function TopBar({ actions }: { actions?: ReactNode }) {
  return (
    <header
      className={cn(
        'app-drag flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar pr-3 text-sidebar-foreground select-none',
        isMac ? 'pl-21' : 'pl-4',
      )}
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-background">
        <ArrowLeftRight className="size-3" strokeWidth={2.5} />
      </span>
      <span className="text-sm font-semibold tracking-tight">ohmyswitch</span>
      {actions && <div className="app-no-drag ml-auto flex items-center gap-1">{actions}</div>}
    </header>
  );
}
