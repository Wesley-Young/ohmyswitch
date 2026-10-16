import '@/styles.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import App from '@/App';
import { syncColorScheme } from '@/lib/theme';
import { queryClient } from '@/lib/trpc';
import Harnesses from '@/routes/harnesses';
import NotFound from '@/routes/not-found';
import Providers from '@/routes/providers';

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
            <Route path="providers" element={<Providers />} />
            <Route path="harnesses" element={<Harnesses />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
