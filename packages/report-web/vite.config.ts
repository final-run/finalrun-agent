import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the standalone CLI-hosted report SPA.
//
// Build output lands in dist/app/ and is copied into packages/cli/dist/report-app/
// during the CLI build; the CLI's report server (packages/cli/src/reportServer.ts)
// hosts the bundle with an index.html fallback for deep links.
//
// Dev server proxies /api, /artifacts, /health to 127.0.0.1:4173 so the SPA
// can run against a local `finalrun start-server` without CORS hoops.

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  publicDir: path.resolve(__dirname, 'public'),
  build: {
    outDir: path.resolve(__dirname, 'dist/app'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:4173',
      '/artifacts': 'http://127.0.0.1:4173',
      '/health': 'http://127.0.0.1:4173',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5174,
  },
});
