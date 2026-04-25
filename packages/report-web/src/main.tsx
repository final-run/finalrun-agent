// Vite entry point for the standalone CLI-hosted report SPA. Mounts
// StandaloneReportApp, which wires react-router + the default CLI data
// source that fetches /api/report/*.
//
// The same page components are exported through @finalrun/report-web/ui for
// embedding; the routes barrel (./routes) exposes router fragments for
// downstream SPAs (finalrun-cloud/web) to splice into their own routers.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StandaloneReportApp } from './routes/index';

import './ui/styles/shared.css';
import './ui/styles/run-index.css';
import './ui/styles/run-detail.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root container in index.html');
}

createRoot(container).render(
  <StrictMode>
    <StandaloneReportApp />
  </StrictMode>,
);
