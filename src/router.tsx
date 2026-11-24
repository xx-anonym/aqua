import { lazy, Suspense, useState, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './ui/Layout';
import { RouteError } from './ui/RouteError';
import DiscoverScreen from './screens/discover/DiscoverScreen';
import StartScreen from './screens/start/StartScreen';

const preloads: (() => Promise<unknown>)[] = [];

/**
 * A page whose code loads on first use. Once loaded – on the way there, or ahead by preloadPages –
 * it draws at once without the loading step, so a page transition shows the page itself and not
 * the spinner.
 */
function page(load: () => Promise<{ default: ComponentType }>) {
  let loaded: ComponentType | null = null;
  const preload = () =>
    load().then((m) => {
      loaded = m.default;
      return m;
    });
  preloads.push(() => preload().catch(() => undefined));
  const Lazy = lazy(preload);
  function Page() {
    // Decided once per page visit, so the page is not drawn anew when its code arrives.
    const [Ready] = useState(() => loaded);
    if (Ready) return <Ready />;
    return (
      <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
        <Lazy />
      </Suspense>
    );
  }
  return <Page />;
}

/** Loads the code of all pages in idle time (it is in the offline cache, so this costs no data). */
export function preloadPages() {
  const run = () => preloads.forEach((p) => void p());
  // Safari has no requestIdleCallback.
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 2000);
}

export const routes = [
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        // A page that fails while drawing shows RouteError inside the layout (tab bar stays).
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Navigate to="/start" replace /> },
          { path: 'start', element: <StartScreen /> },
          { path: 'discover', element: <DiscoverScreen /> },
          { path: 'species/:id', element: page(() => import('./screens/discover/SpeciesScreen')) },
          { path: 'compare/:a/:b', element: page(() => import('./screens/discover/CompareScreen')) },
          { path: 'identify', element: page(() => import('./screens/identify/IdentifyScreen')) },
          { path: 'logbook', element: page(() => import('./screens/logbook/LogbookScreen')) },
          { path: 'logbook/new', element: page(() => import('./screens/logbook/DiveEditorScreen')) },
          { path: 'logbook/import', element: page(() => import('./screens/logbook/ImportScreen')) },
          { path: 'logbook/sites', element: page(() => import('./screens/logbook/SitesScreen')) },
          { path: 'logbook/stats', element: page(() => import('./screens/logbook/StatsScreen')) },
          { path: 'logbook/:id', element: page(() => import('./screens/logbook/DiveDetailScreen')) },
          { path: 'logbook/:id/edit', element: page(() => import('./screens/logbook/DiveEditorScreen')) },
          { path: 'sighting/new', element: page(() => import('./screens/sighting/QuickSightingScreen')) },
          { path: 'collection', element: page(() => import('./screens/collection/CollectionScreen')) },
          { path: 'collection/albums/:id', element: page(() => import('./screens/collection/AlbumScreen')) },
          { path: 'shared', element: page(() => import('./screens/collection/SharedAlbumScreen')) },
          { path: 'profile', element: page(() => import('./screens/profile/ProfileScreen')) },
          { path: 'profile/credits', element: page(() => import('./screens/profile/CreditsScreen')) },
          { path: '*', element: <Navigate to="/start" replace /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes, {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});
