import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import './i18n';
import { App } from './App';
import { setupInstall } from './lib/install';
import { setupHaptics } from './ui/haptics';

setupHaptics();
setupInstall();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
