import { useCallback, useRef } from 'react';
import { create } from 'zustand';

const useStore = create<{ values: Record<string, unknown>; put: (key: string, value: unknown) => void }>((set) => ({
  values: {},
  put: (key, value) => set((s) => ({ values: { ...s.values, [key]: value } })),
}));

/**
 * Like useState, but the value survives leaving the screen (e.g. opening a species and coming
 * back). Kept in memory for the running app only, not across reloads.
 */
export function useSessionState<T>(key: string, initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const has = useStore((s) => key in s.values);
  const stored = useStore((s) => s.values[key]) as T;
  // Computed once per mount while nothing is stored, so objects keep their identity between renders.
  const initialRef = useRef<{ value: T } | null>(null);
  if (!has && !initialRef.current) {
    initialRef.current = { value: typeof initial === 'function' ? (initial as () => T)() : initial };
  }
  const value = has ? stored : initialRef.current!.value;

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const { values, put } = useStore.getState();
      const prev = (key in values ? values[key] : initialRef.current?.value) as T;
      put(key, typeof next === 'function' ? (next as (p: T) => T)(prev) : next);
    },
    [key],
  );
  return [value, setValue];
}
