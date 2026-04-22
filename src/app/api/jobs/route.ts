import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/jobs — proxy to the Cloudflare producer Worker.
 *
 * Why proxy at all? Two reasons:
 *   1. Same-origin: the browser calls a relative /api path, so no CORS config is
 *      needed in the producer Worker for the main app.
 *   2. Env boundary: the Worker URL lives in server-only env, not exposed to the
 *      client bundle. We can swap endpoints (prod vs dev) without rebuilding.
 *
 * If RUBRIC_PRODUCER_URL is not configured, we return 503 rather than falling
 * back to the inline pipeline — the caller should check the feature flag and
 * decide whether to use the async path.
 */
export async function POST(request: NextRequest) {
  const producerUrl = process.env.RUBRIC_PRODUCER_URL;
  if (!producerUrl) {
    return NextResponse.json(
      { error: 'Async pipeline not configured. Set RUBRIC_PRODUCER_URL in env.' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { text } = (body as { text?: unknown }) ?? {};
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json(
      { error: 'text is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  try {
    const workerRes = await fetch(`${producerUrl}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jdText: text }),
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
