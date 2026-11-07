import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import './i18n';
import { App } from './App';
import { restPoster, setupErrorLog } from './lib/errorLog';
import { isStandalone, setupInstall } from './lib/install';
import { useSync } from './sync/syncManager';
import { setupHaptics } from './ui/haptics';

// First, so that errors during start are reported too. Only in the deployed app, not in development.
setupErrorLog(import.meta.env.PROD ? restPoster(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY) : null, () => ({
  path: location.pathname,
  version: __APP_VERSION__,
  browser: navigator.userAgent,
  installed: isStandalone(),
  signedIn: !!useSync.getState().userId,
  origin: location.origin,
}));
setupHaptics();
setupInstall();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
