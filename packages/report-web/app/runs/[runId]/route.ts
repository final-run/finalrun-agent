import { NextResponse } from 'next/server';
import { loadReportRunManifestViewModel, renderHtmlErrorPage } from '../../../src/artifacts';
import { renderRunHtml } from '../../../src/renderers';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  try {
    const { runId } = await context.params;
    const manifest = await loadReportRunManifestViewModel(runId);
    return new NextResponse(renderRunHtml(manifest), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    return new NextResponse(
      renderHtmlErrorPage({
        title: 'Run Not Found',
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      },
    );
  }
}
