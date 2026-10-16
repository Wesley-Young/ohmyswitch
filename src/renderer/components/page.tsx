import type { ReactNode } from 'react';

/** Page title bar. It doubles as the window drag region; actions opt out of dragging. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="app-drag border-b">
      <div className="mx-auto flex max-w-5xl items-end justify-between gap-6 px-8 pt-12 pb-6">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight">{title}</h1>
        {actions && <div className="app-no-drag flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function PageContent({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>;
}
