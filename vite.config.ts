import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      // The app shows an update banner (src/ui/UpdateBanner.tsx) instead of reloading by itself.
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Aqua – Tauch-Logbuch & Artensammlung',
        short_name: 'Aqua',
        description: 'Meerestiere bestimmen, Tauchgänge loggen und jede gesichtete Art sammeln – auch offline.',
        lang: 'de',
        theme_color: '#0b5f66',
        background_color: '#071318',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell and the catalog database are precached, so catalog, search, filter, logbook
        // and collection work offline right after install. Thumbnails are warmed in parallel by
        // the app after start (src/lib/offline.ts), which is much faster than precaching 500 files.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,sqlite}', 'catalog/catalog-manifest.json'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/catalog/thumb/'),
            handler: 'CacheFirst',
            options: { cacheName: 'catalog-thumbs', expiration: { maxEntries: 5000 } },
          },
          {
            // Full-size species photos; the "offline package" fills this cache in bulk.
            urlPattern: ({ url }) => url.pathname.startsWith('/catalog/img/'),
            handler: 'CacheFirst',
            options: { cacheName: 'catalog-images', expiration: { maxEntries: 5000 } },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    css: false,
  },
});
