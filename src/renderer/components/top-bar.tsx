import { cn } from 'cn';
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
      <img src="/logo.svg" alt="" className="size-5 shrink-0" draggable={false} />
      <span className="text-sm font-semibold tracking-tight">ohmyswitch</span>
      {actions && <div className="app-no-drag ml-auto flex items-center gap-1">{actions}</div>}
    </header>
  );
}
