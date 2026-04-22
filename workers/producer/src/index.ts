/**
 * Producer Worker — HTTP edge layer for the rubric pipeline.
 *
 * Two endpoints:
 *   POST /jobs           Enqueue a new rubric generation job. Returns { jobId } immediately.
 *   GET  /jobs/:jobId    Poll for status. Returns the status record, plus the result if status === 'done'.
 *
 * Why a Worker instead of staying in Next.js?
 *   - Next.js API routes block the App Runner instance during the long Claude calls.
 *   - The Worker hands the work to the queue in <100ms and gets out of the way.
 *   - Cold start is near-zero on Workers; pricing per request is cheaper than App Runner-seconds.
 *
 * Idempotency note:
 *   - Each request gets a fresh jobId. We don't dedupe based on JD content because
 *     two identical JDs could legitimately want two separate rubrics. Idempotency
 *     happens INSIDE the consumer, keyed on jobId.
 */

import { JobStatus, R2_KEYS, RubricJobMessage, RubricResult, StatusRecord } from '../../shared/types';

interface Env {
  RUBRIC_QUEUE: Queue<RubricJobMessage>;
  RUBRICS_BUCKET: R2Bucket;
  MAX_JD_LENGTH: string;
  ALLOWED_ORIGINS: string;
}

/**
 * Build CORS headers for a given request origin.
 * Only echoes the origin back if it matches the allowed list — never `*`.
 */
function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const origin = request.headers.get('Origin') ?? '';
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonResponse(body: unknown, init: ResponseInit, request: Request, env: Env): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env),
      ...(init.headers ?? {}),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);

    // POST /jobs — enqueue a new rubric job
    if (request.method === 'POST' && url.pathname === '/jobs') {
      return handleEnqueue(request, env);
    }

    // GET /jobs/:jobId — poll status (and read result when done)
    const jobMatch = url.pathname.match(/^\/jobs\/([a-zA-Z0-9_-]+)$/);
    if (request.method === 'GET' && jobMatch) {
      return handlePoll(jobMatch[1], request, env);
    }

    // Health check
    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true, role: 'producer' }, { status: 200 }, request, env);
    }

    return jsonResponse({ error: 'Not found' }, { status: 404 }, request, env);
  },
} satisfies ExportedHandler<Env>;

/**
 * POST /jobs
 *
 * Body: { jdText: string }
 *
 * Flow:
 *   1. Validate input (presence + length cap)
 *   2. Generate jobId (UUIDv4 via crypto.randomUUID, available in Workers runtime)
 *   3. Write initial status record to R2 (status: 'queued')
 *   4. Enqueue the job message
 *   5. Return { jobId } so the frontend can start polling
 *
 * If steps 3 or 4 fail, we surface the error to the caller — better than silently dropping the job.
 */
async function handleEnqueue(request: Request, env: Env): Promise<Response> {
  let body: { jdText?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, { status: 400 }, request, env);
  }

  const jdText = body.jdText;
  const maxLen = parseInt(env.MAX_JD_LENGTH, 10);

  if (typeof jdText !== 'string' || jdText.trim().length === 0) {
    return jsonResponse(
      { error: 'jdText is required and must be a non-empty string' },
      { status: 400 },
      request,
      env
    );
  }

  if (jdText.length > maxLen) {
    return jsonResponse(
      { error: `jdText exceeds maximum length of ${maxLen} characters` },
      { status: 413 },
      request,
      env
    );
  }

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  const status: StatusRecord = {
    jobId,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };

  const message: RubricJobMessage = {
    jobId,
    jdText,
    enqueuedAt: now,
  };

  // Write status FIRST so polling never returns a 404 race for a job we've already accepted.
  // If the queue send fails after this, the status sits at 'queued' indefinitely — the consumer
  // will never pick it up. That's a known trade-off; an alternative is to write status AFTER
  // the queue send, but then there's a polling-window race in the other direction.
  try {
    await env.RUBRICS_BUCKET.put(R2_KEYS.status(jobId), JSON.stringify(status), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (err) {
    console.error('Failed to write initial status to R2', { jobId, err });
    return jsonResponse(
      { error: 'Failed to record job status' },
      { status: 500 },
      request,
      env
    );
  }

  try {
    await env.RUBRIC_QUEUE.send(message);
  } catch (err) {
    console.error('Failed to enqueue job', { jobId, err });
    // Best-effort: mark the job as failed so polling doesn't hang
    const failed: StatusRecord = {
      ...status,
      status: 'failed',
      updatedAt: new Date().toISOString(),
      error: 'Failed to enqueue job',
    };
    await env.RUBRICS_BUCKET.put(R2_KEYS.status(jobId), JSON.stringify(failed), {
      httpMetadata: { contentType: 'application/json' },
    }).catch(() => {});
    return jsonResponse(
      { error: 'Failed to enqueue job' },
      { status: 500 },
      request,
      env
    );
  }

  return jsonResponse({ jobId, status: 'queued' as JobStatus }, { status: 202 }, request, env);
}

/**
 * GET /jobs/:jobId
 *
 * Returns:
 *   { status: 'queued' | 'running' }                       → still in flight
 *   { status: 'done', rubric: RubricResult }                → terminal success
 *   { status: 'failed', error: string }                     → terminal failure
 *   404                                                     → unknown jobId
 *
 * Cost optimization: status object is tiny (~150 bytes), so polling is cheap.
 * We only fetch the full rubric result when status === 'done'.
 */
async function handlePoll(jobId: string, request: Request, env: Env): Promise<Response> {
  const statusObj = await env.RUBRICS_BUCKET.get(R2_KEYS.status(jobId));

  if (!statusObj) {
    return jsonResponse({ error: 'Job not found' }, { status: 404 }, request, env);
  }

  const status: StatusRecord = await statusObj.json();

  if (status.status !== 'done') {
    return jsonResponse(status, { status: 200 }, request, env);
  }

  // Status is 'done' — fetch the actual rubric.
  const resultObj = await env.RUBRICS_BUCKET.get(R2_KEYS.result(jobId));
  if (!resultObj) {
    // Status says done but result is missing — treat as failed (data corruption / race condition)
    console.error('Status=done but result missing in R2', { jobId });
    return jsonResponse(
      {
        ...status,
        status: 'failed' as JobStatus,
        error: 'Result missing despite done status',
      },
      { status: 500 },
      request,
      env
    );
  }

  const rubric: RubricResult = await resultObj.json();
  return jsonResponse({ ...status, rubric }, { status: 200 }, request, env);
}
