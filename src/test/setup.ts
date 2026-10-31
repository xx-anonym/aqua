import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '../i18n';

(globalThis as Record<string, unknown>).__APP_VERSION__ = 'test';
(globalThis as Record<string, unknown>).__APP_BUILD__ = 'test';
(globalThis as Record<string, unknown>).__APP_BUILT_AT__ = '2026-01-01T00:00:00.000Z';

afterEach(() => cleanup());
