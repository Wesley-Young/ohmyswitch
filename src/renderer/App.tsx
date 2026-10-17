import { Plus } from 'lucide-react';
import { Link, Outlet } from 'react-router';

import { DeepLinkListener } from '@/components/deep-link-listener';
import { TopBar } from '@/components/top-bar';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function App() {
  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar
          actions={
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/providers/new" />}>
              <Plus data-icon="inline-start" />
              添加供应商
            </Button>
          }
        />
        <div className="flex min-h-0 flex-1">
          <Outlet />
        </div>
      </div>
      <Toaster position="bottom-right" />
      <DeepLinkListener />
    </TooltipProvider>
  );
}
