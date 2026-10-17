import { cn } from 'cn';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

/**
 * Page title bar. It doubles as the window drag region; interactive parts opt out of dragging.
 * Pages with `backTo` are secondary pages and get a smaller title.
 */
export function PageHeader({ title, actions, backTo }: { title: string; actions?: ReactNode; backTo?: string }) {
  return (
    <header className="app-drag border-b">
      <div className="mx-auto flex max-w-5xl items-end justify-between gap-6 px-8 pt-12 pb-6">
        <div className="flex min-w-0 items-center gap-2">
          {backTo && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="app-no-drag -ml-2"
              aria-label="返回"
              nativeButton={false}
              render={<Link to={backTo} />}
            >
              <ArrowLeft />
            </Button>
          )}
          <h1 className={cn('truncate font-semibold tracking-tight', backTo ? 'text-lg' : 'text-2xl')}>{title}</h1>
        </div>
        {actions && <div className="app-no-drag flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function PageContent({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>;
}
