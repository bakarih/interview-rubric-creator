import { Rubric } from '@/types';

/**
 * Client-side utility for the async rubric pipeline.
 *
 * Flow:
 *   1. POST the JD text to /api/jobs → returns { jobId, status: 'queued' }
 *   2. Poll GET /api/jobs/:jobId every ~2s until status is 'done' or 'failed'
 *   3. Return the Rubric (or throw on failure or timeout)
 *
 * Why polling (not Server-Sent Events or WebSockets)?
 *   - Rubric jobs complete in ~30-45 seconds. Polling every 2s = ~15-22 requests.
 *   - Each poll reads a ~150-byte status object from R2. Extremely cheap.
 *   - SSE would require a long-lived connection that App Runner may or may not
 *     keep open cleanly through proxies. Polling is boring and reliable.
 *   - If this ever grows to thousands of concurrent jobs, revisit.
 */

export type AsyncJobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface StatusResponse {
  jobId: string;
  status: AsyncJobStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  error?: string;
  /** Present when status === 'done' */
  rubric?: Rubric;
}

export interface SubmitResponse {
  jobId: string;
  status: AsyncJobStatus;
}

export interface RunAsyncPipelineOptions {
  /** Called with the current status on every poll, so the UI can show progress. */
  onStatus?: (status: AsyncJobStatus, attempts: number) => void;
  /** Milliseconds between polls. Default 2000. */
  pollIntervalMs?: number;
  /** Max wall-clock time before giving up. Default 90 seconds. */
  timeoutMs?: number;
  /** AbortSignal so callers can cancel the flow (e.g., user clicks "Start Over"). */
  signal?: AbortSignal;
}

/**
 * Submit a JD for async processing and wait for the rubric.
 *
 * Resolves with the Rubric on success. Rejects on any of:
 *   - submission error (4xx, 5xx, or network failure)
 *   - terminal failure status from the pipeline
 *   - timeout
 *   - caller abort
 */
export async function runAsyncPipeline(
  text: string,
  options: RunAsyncPipelineOptions = {}
): Promise<Rubric> {
  const {
    onStatus,
    pollIntervalMs = 2000,
    timeoutMs = 90_000,
    signal,
  } = options;

  // Step 1: Submit the job.
  const submitRes = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!submitRes.ok) {
    const data = (await submitRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to submit job (HTTP ${submitRes.status})`);
  }

  const submitData = (await submitRes.json()) as SubmitResponse;
  const { jobId } = submitData;

  if (!jobId) {
    throw new Error('Submission succeeded but no jobId was returned');
  }

  onStatus?.('queued', 0);

  // Step 2: Poll until terminal state or timeout.
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    // Respect cancellation between polls.
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    await sleep(pollIntervalMs, signal);

    const pollRes = await fetch(`/api/jobs/${jobId}`, {
      method: 'GET',
      signal,
    });

    if (!pollRes.ok) {
      // 404 after submission is surprising — treat as transient and keep polling,
      // UNLESS we've been at it for a while (which means the job genuinely doesn't exist).
      if (pollRes.status === 404 && Date.now() - startTime < 10_000) {
        continue;
      }
      const data = (await pollRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Poll failed (HTTP ${pollRes.status})`);
    }

    const statusData = (await pollRes.json()) as StatusResponse;
    onStatus?.(statusData.status, statusData.attempts);

    if (statusData.status === 'done') {
      if (!statusData.rubric) {
        throw new Error('Job reported done but no rubric was returned');
      }
      return statusData.rubric;
    }

    if (statusData.status === 'failed') {
      throw new Error(statusData.error ?? 'Pipeline failed with no error message');
    }

    // status is 'queued' or 'running' — keep polling.
  }

  throw new Error(`Rubric generation timed out after ${Math.round(timeoutMs / 1000)}s`);
}

/**
 * Promise-based sleep that respects AbortSignal.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}
