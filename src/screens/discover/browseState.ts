import { create } from 'zustand';
import { emptyFilter, placeFilter, type SpeciesFilter } from '../../catalog/filter';

interface BrowseState {
  query: string;
  filter: SpeciesFilter;
}

interface BrowseStore {
  states: Record<string, BrowseState>;
  update: (key: string, patch: Partial<BrowseState>) => void;
}

/** Search text and filters per browser instance, kept while navigating to a species and back. */
export const useBrowseStore = create<BrowseStore>((set) => ({
  states: {},
  update: (key, patch) =>
    set((s) => ({
      states: { ...s.states, [key]: { ...(s.states[key] ?? { query: '', filter: emptyFilter() }), ...patch } },
    })),
}));

export function useBrowseState(key: string, defaultRegion: string | null) {
  const state = useBrowseStore((s) => s.states[key]);
  const update = useBrowseStore((s) => s.update);
  const current: BrowseState = state ?? {
    query: '',
    filter: { ...emptyFilter(), ...placeFilter(defaultRegion) },
  };
  return {
    ...current,
    setQuery: (query: string) => update(key, { ...current, query }),
    setFilter: (filter: SpeciesFilter) => update(key, { ...current, filter }),
  };
}
