import { defineConfig } from 'tsup';

// Builds the @finalrun/report-web/ui and /routes library bundles consumed by
// downstream projects (finalrun-cloud). The Vite SPA build (`vite build`) is
// independent and produces dist/app/.

export default defineConfig({
  entry: {
    'ui/index': 'src/ui/index.ts',
    'routes/index': 'src/routes/index.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  tsconfig: 'tsconfig.lib.json',
  dts: { resolve: true },
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'es2022',
  // Peer deps marked external. `@finalrun/common` is NOT external: it lives
  // in package.json dependencies but we want its TYPES inlined into our
  // .d.mts so downstream consumers (finalrun-cloud) don't need @finalrun/common
  // installed just to typecheck. `noExternal` forces tsup + rollup-plugin-dts
  // to follow into the common package and flatten the types.
  // The runtime bundle stays clean because the library only uses
  // `import type { ... }` from common — TS erases all those imports.
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-router-dom'],
  noExternal: ['@finalrun/common'],
  // Do NOT include any CSS: stylesheets ship as a separate build artifact
  // assembled by scripts/build-styles.mjs.
  loader: { '.css': 'empty' },
});
