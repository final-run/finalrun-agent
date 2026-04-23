// Tiny, pure route helpers. No Node deps so they can be imported from both
// server and client components.

export function buildRunRoute(runId: string): string {
  return `/runs/${encodeURIComponent(runId)}`;
}

export function buildArtifactRoute(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`Invalid artifact path: ${relativePath}`);
  }
  return `/artifacts/${segments.map(encodeURIComponent).join('/')}`;
}
