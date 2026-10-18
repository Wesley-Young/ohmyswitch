import { cn } from 'cn';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

/**
 * Title of the content pane, with the pane's actions on the right. Pages with `backTo` are secondary pages
 * (such as editing) and get a back button and a smaller title.
 */
export function PageHeader({
  title,
  actions,
  backTo,
  icon,
  children,
}: {
  title: ReactNode;
  /** Shown before the title, such as the provider avatar. */
  icon?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  /** Extra lines under the title. */
  children?: ReactNode;
}) {
  return (
    <header className="border-b">
      {/* A one-line title lines up with the actions on its center; with extra lines, the actions stay at the top. */}
      <div
        className={cn(
          'mx-auto flex max-w-4xl justify-between gap-6 px-8 pt-8 pb-6',
          children ? 'items-start' : 'items-center',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {backTo && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="-ml-2"
              aria-label="返回"
              nativeButton={false}
              render={<Link to={backTo} />}
            >
              <ArrowLeft />
            </Button>
          )}
          {icon}
          <div className="min-w-0">
            <h1 className={cn('truncate font-semibold tracking-tight', backTo ? 'text-lg' : 'text-2xl')}>{title}</h1>
            {children}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function PageContent({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-4xl px-8 py-8">{children}</div>;
}
