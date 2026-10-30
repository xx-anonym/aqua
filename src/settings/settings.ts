import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DepthUnit = 'm' | 'ft';
export type TempUnit = 'c' | 'f';
export type PressureUnit = 'bar' | 'psi';
export type Theme = 'system' | 'light' | 'dark';
export type Language = 'de' | 'en';

export interface SettingsState {
  depthUnit: DepthUnit;
  tempUnit: TempUnit;
  pressureUnit: PressureUnit;
  theme: Theme;
  language: Language;
  /** Region preselected in Discover and Collection; null = all regions. */
  region: string | null;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      depthUnit: 'm',
      tempUnit: 'c',
      pressureUnit: 'bar',
      theme: 'system',
      language: 'de',
      region: null,
      set: (patch) => set(patch),
    }),
    { name: 'aqua-settings' },
  ),
);
