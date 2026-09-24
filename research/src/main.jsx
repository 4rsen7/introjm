import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './i18n';
import './styles.css';
import { Brand, LanguageSwitch, Loading } from './components/UI';
import { UnsavedChangesProvider } from './hooks/useUnsavedChanges';

const App = lazy(() => import('./app/App'));
const router = createBrowserRouter([{ path: '/*', element: <UnsavedChangesProvider><Suspense fallback={<Loading />}><App /></Suspense></UnsavedChangesProvider> }]);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } } });
function Root() {
  const { t } = useTranslation();
  const configured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  if (!configured) return <main className="app-shell-bg min-h-screen p-6 sm:p-12"><div className="flex justify-between"><Brand /><LanguageSwitch /></div><div className="app-surface mx-auto mt-20 max-w-lg rounded-3xl p-8"><h1 className="text-2xl font-bold tracking-tight">{t('research.configTitle')}</h1><p className="mt-4 leading-7 text-slate-500">{t('research.configBody')}</p></div></main>;
  return <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);
