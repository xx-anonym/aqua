import { lazy, Suspense, type ComponentProps } from 'react';

// Leaflet is loaded on demand so it does not weigh on the first paint.
const LazyRegionMap = lazy(() => import('./LeafletMaps').then((m) => ({ default: m.RegionMap })));
const LazySitesMap = lazy(() => import('./LeafletMaps').then((m) => ({ default: m.SitesMap })));
const LazyLocationPicker = lazy(() => import('./LeafletMaps').then((m) => ({ default: m.LocationPicker })));

const Fallback = ({ tall }: { tall?: boolean }) => <div className={`map${tall ? ' tall' : ''}`} />;

export function RegionMap(props: ComponentProps<typeof LazyRegionMap>) {
  return (
    <Suspense fallback={<Fallback />}>
      <LazyRegionMap {...props} />
    </Suspense>
  );
}

export function SitesMap(props: ComponentProps<typeof LazySitesMap>) {
  return (
    <Suspense fallback={<Fallback tall />}>
      <LazySitesMap {...props} />
    </Suspense>
  );
}

export function LocationPicker(props: ComponentProps<typeof LazyLocationPicker>) {
  return (
    <Suspense fallback={<Fallback />}>
      <LazyLocationPicker {...props} />
    </Suspense>
  );
}
