import {
  ArtifactRangeNotSatisfiableError,
  loadArtifactResponse,
  renderHtmlErrorPage,
} from '../../../src/artifacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ artifactPath?: string[] }> },
): Promise<Response> {
  return await handleArtifactRequest(request, context, false);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ artifactPath?: string[] }> },
): Promise<Response> {
  return await handleArtifactRequest(request, context, true);
}

async function handleArtifactRequest(
  request: Request,
  context: { params: Promise<{ artifactPath?: string[] }> },
  headOnly: boolean,
): Promise<Response> {
  try {
    const { artifactPath = [] } = await context.params;
    const artifact = await loadArtifactResponse(artifactPath, request.headers.get('range'));
    return new Response(headOnly ? null : artifact.body, {
      status: artifact.status,
      headers: {
        ...artifact.headers,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof ArtifactRangeNotSatisfiableError) {
      return new Response(headOnly ? null : 'Requested range is not satisfiable.', {
        status: 416,
        headers: {
          'content-range': `bytes */${error.size}`,
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }
    return new Response(
      renderHtmlErrorPage({
        title: 'Artifact Not Found',
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      },
    );
  }
}
