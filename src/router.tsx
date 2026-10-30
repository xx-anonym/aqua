import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './ui/Layout';
import DiscoverScreen from './screens/discover/DiscoverScreen';

function page(load: () => Promise<{ default: ComponentType }>) {
  const Component = lazy(load);
  return (
    <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
      <Component />
    </Suspense>
  );
}

export const routes = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/discover" replace /> },
      { path: 'discover', element: <DiscoverScreen /> },
      { path: 'species/:id', element: page(() => import('./screens/discover/SpeciesScreen')) },
      { path: 'compare/:a/:b', element: page(() => import('./screens/discover/CompareScreen')) },
      { path: 'identify', element: page(() => import('./screens/identify/IdentifyScreen')) },
      { path: 'logbook', element: page(() => import('./screens/logbook/LogbookScreen')) },
      { path: 'logbook/new', element: page(() => import('./screens/logbook/DiveEditorScreen')) },
      { path: 'logbook/import', element: page(() => import('./screens/logbook/ImportScreen')) },
      { path: 'logbook/sites', element: page(() => import('./screens/logbook/SitesScreen')) },
      { path: 'logbook/:id', element: page(() => import('./screens/logbook/DiveDetailScreen')) },
      { path: 'logbook/:id/edit', element: page(() => import('./screens/logbook/DiveEditorScreen')) },
      { path: 'sighting/new', element: page(() => import('./screens/sighting/QuickSightingScreen')) },
      { path: 'collection', element: page(() => import('./screens/collection/CollectionScreen')) },
      { path: 'collection/albums/:id', element: page(() => import('./screens/collection/AlbumScreen')) },
      { path: 'shared', element: page(() => import('./screens/collection/SharedAlbumScreen')) },
      { path: 'profile', element: page(() => import('./screens/profile/ProfileScreen')) },
      { path: 'profile/credits', element: page(() => import('./screens/profile/CreditsScreen')) },
      { path: '*', element: <Navigate to="/discover" replace /> },
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
