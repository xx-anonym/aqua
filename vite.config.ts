import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

import { execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import type { Connect } from 'vite';
import pkg from './package.json' with { type: 'json' };

/** Short commit id of this build (Vercel provides it; locally read from git). */
function buildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

const BUILD = { version: pkg.version, build: buildId(), built_at: new Date().toISOString() };

/**
 * The catalog photos live in catalog-images/ (their own Vercel project, see its README); in the
 * deployed app vercel.json rewrites /catalog/img/… and /catalog/thumb/… there. Locally the dev and
 * preview servers serve them under the same addresses.
 */
const IMAGES = join(__dirname, 'catalog-images');
const catalogImages: Connect.NextHandleFunction = (req, res, next) => {
  const path = (req.url ?? '').split('?')[0];
  if (!/^\/catalog\/(img|thumb)\//.test(path)) return next();
  const file = normalize(join(IMAGES, path.slice('/catalog/'.length)));
  if (!file.startsWith(IMAGES) || !existsSync(file) || !statSync(file).isFile()) return next();
  res.setHeader('Content-Type', 'image/webp');
  createReadStream(file).pipe(res);
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(BUILD.version),
    __APP_BUILD__: JSON.stringify(BUILD.build),
    __APP_BUILT_AT__: JSON.stringify(BUILD.built_at),
  },
  plugins: [
    react(),
    {
      name: 'aqua-catalog-images',
      configureServer: (server) => void server.middlewares.use(catalogImages),
      configurePreviewServer: (server) => void server.middlewares.use(catalogImages),
    },
    // /version.json names the deployed build, so "Nach Updates suchen" can ask the server directly
    // instead of relying only on the service worker (Safari reports a new worker late).
    {
      name: 'aqua-version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(BUILD) });
      },
    },
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
        background_color: '#08464d',
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
        // and collection work offline right after install. Thumbnails and photos are cached when
        // viewed, or ahead of a trip from the profile (src/lib/offline.ts).
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,sqlite}', 'catalog/catalog-manifest.json'],
        // iOS startup images: fetched by iOS itself, only the one matching the device.
        globIgnores: ['splash/**'],
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
