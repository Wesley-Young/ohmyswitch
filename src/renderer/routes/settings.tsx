import { cn } from 'cn';
import { ArrowLeft, Puzzle, Settings2 } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';

import { Button } from '@/components/ui/button';

/** Settings navigation on the left, with the selected settings page on the right. */
export default function Settings() {
  const items = [
    { to: '/settings/models', label: '模型信息覆盖', icon: Settings2 },
    { to: '/settings/plugins', label: '插件', icon: Puzzle },
  ];
  return (
    <>
      <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center gap-2 px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="返回供应商"
            nativeButton={false}
            render={<Link to="/providers" />}
          >
            <ArrowLeft />
          </Button>
          <h1 className="text-sm font-semibold">设置</h1>
        </div>
        <nav aria-label="设置" className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </>
  );
}
