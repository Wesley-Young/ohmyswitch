import { Outlet } from 'react-router';

import { ProviderList } from '@/components/provider-list';

/** Providers on the left; the selected provider, or the add and edit forms, on the right. */
export default function Providers() {
  return (
    <>
      <ProviderList />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </>
  );
}
