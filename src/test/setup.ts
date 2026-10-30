import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '../i18n';

(globalThis as Record<string, unknown>).__APP_VERSION__ = 'test';

afterEach(() => cleanup());
