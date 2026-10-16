import { Outlet } from 'react-router';

import { AppSidebar } from '@/components/app-sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function App() {
  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
