import '@/styles.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import App from '@/App';
import { syncColorScheme } from '@/lib/theme';
import { queryClient } from '@/lib/trpc';
import NotFound from '@/routes/not-found';
import ProviderDetail from '@/routes/provider-detail';
import ProviderEdit from '@/routes/provider-edit';
import ProviderNew from '@/routes/provider-new';
import Providers from '@/routes/providers';
import ProvidersIndex from '@/routes/providers-index';

syncColorScheme();

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}>
            <Route index element={<Navigate to="/providers" replace />} />
            <Route path="providers" element={<Providers />}>
              <Route index element={<ProvidersIndex />} />
              <Route path="new" element={<ProviderNew />} />
              <Route path=":providerId" element={<ProviderDetail />} />
              <Route path=":providerId/edit" element={<ProviderEdit />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
