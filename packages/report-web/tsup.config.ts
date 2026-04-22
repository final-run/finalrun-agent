import { defineConfig } from 'tsup';

// Builds the @finalrun/report-web/ui library bundle consumed by downstream
// projects (finalrun-cloud). Next.js build is independent — `next build`
// produces the standalone Next.js app used by the OSS CLI; tsup produces the
// React library bundle with all CSS class names preserved.

export default defineConfig({
  entry: { index: 'src/ui/index.ts' },
  outDir: 'dist/ui',
  format: ['esm'],
  tsconfig: 'tsconfig.lib.json',
  dts: { resolve: true },
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // Peer deps marked external. `@finalrun/common` is NOT external: it lives
  // in package.json dependencies but we want its TYPES inlined into our
  // .d.mts so downstream consumers (finalrun-cloud) don't need @finalrun/common
  // installed just to typecheck. `noExternal` forces tsup + rollup-plugin-dts
  // to follow into the common package and flatten the types.
  // The runtime bundle stays clean because the library only uses
  // `import type { ... }` from common — TS erases all those imports.
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  noExternal: ['@finalrun/common'],
  // Do NOT include any CSS: stylesheets ship as a separate build artifact
  // assembled by scripts/build-styles.mjs so Next.js's own CSS handling is
  // not involved in the library bundle.
  loader: { '.css': 'empty' },
});
