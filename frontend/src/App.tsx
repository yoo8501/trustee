import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import { RouterProvider } from 'react-router';
import i18n from './lib/i18n';
import { AppThemeProvider } from './lib/theme';
import { router } from './routes';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });
}

export function App() {
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AppThemeProvider>
          <RouterProvider router={router} />
        </AppThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
