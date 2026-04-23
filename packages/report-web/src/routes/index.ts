// Routes barrel — this file is built as a separate tsup entry and exported
// via `@finalrun/report-web/routes`.
//
// Two consumers:
//   1. The standalone CLI-hosted SPA (src/main.tsx) — uses StandaloneReportApp
//      with defaultCliDataSource, which fetches /api/report/* from the CLI's
//      local HTTP server.
//   2. finalrun-cloud/web — spreads reportRouteObjects({...}) into its parent
//      React Router v7 data router, wiring its own data source to the cloud's
//      REST endpoints.

export {
  StandaloneReportApp,
  reportRouteObjects,
  defaultCliDataSource,
} from './StandaloneReportApp';
export type { ReportDataSource, ReportRouteObjectsOptions } from './StandaloneReportApp';
