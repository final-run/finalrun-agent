import { NextResponse } from 'next/server';
import { resolveReportWorkspaceContext } from '../../src/artifacts';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const context = resolveReportWorkspaceContext();
    return NextResponse.json({
      status: 'ok',
      workspaceRoot: context.workspaceRoot,
      artifactsDir: context.artifactsDir,
      pid: process.pid,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
