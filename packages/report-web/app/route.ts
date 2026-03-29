import { NextResponse } from 'next/server';
import { loadReportIndexViewModel, renderHtmlErrorPage } from '../src/artifacts';
import { renderRunIndexHtml } from '../src/renderers';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const index = await loadReportIndexViewModel();
    return new NextResponse(renderRunIndexHtml(index), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    return new NextResponse(
      renderHtmlErrorPage({
        title: 'Report Server Error',
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      },
    );
  }
}
