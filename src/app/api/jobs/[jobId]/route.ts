import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/jobs/:jobId — poll status from the producer Worker.
 *
 * Returns whatever the producer returns:
 *   { status: 'queued' | 'running' }                  → still in flight
 *   { status: 'done', rubric: {...} }                  → terminal success
 *   { status: 'failed', error: string }                → terminal failure
 *   404                                                 → unknown jobId
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const producerUrl = process.env.RUBRIC_PRODUCER_URL;
  if (!producerUrl) {
    return NextResponse.json(
      { error: 'Async pipeline not configured.' },
      { status: 503 }
    );
  }

  const { jobId } = await params;
  if (!jobId || !/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 });
  }

  try {
    const workerRes = await fetch(`${producerUrl}/jobs/${jobId}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const data = await workerRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: workerRes.status });
  } catch (err) {
    console.error('Failed to reach producer Worker', err);
    return NextResponse.json(
      { error: 'Failed to reach rubric service' },
      { status: 502 }
    );
  }
}
