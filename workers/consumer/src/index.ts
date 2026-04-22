/**
 * Consumer Worker — runs the two-stage Claude pipeline and writes results to R2.
 *
 * Triggered by messages on the `rubric-jobs` queue. For each message:
 *   1. Idempotency check: if a result already exists in R2, ack and skip.
 *      (Queues is at-least-once; the same message CAN be delivered twice.)
 *   2. Update status to 'running'.
 *   3. Run extraction (Haiku) → generation (Sonnet).
 *   4. Write the rubric result to R2.
 *   5. Update status to 'done'.
 *   6. ack() the message.
 *
 * On failure:
 *   - First two failures: retry() with exponential backoff (10s, 30s).
 *   - Third failure: ack the message so it routes to DLQ via max_retries config,
 *     and write a failed-status record to R2 so the frontend can show a useful error.
 *
 * Why per-message handling instead of batch.ackAll() / batch.retryAll()?
 *   Each rubric job is an independent, expensive Claude call. One bad message
 *   shouldn't force the other 4 messages in the batch to retry. Per-message
 *   acks let us isolate failures cleanly.
 */

import {
  AssessmentModality,
  JobStatus,
  R2_KEYS,
  RubricJobMessage,
  RubricResult,
  RubricSignal,
  StatusRecord,
} from '../../shared/types';
import { extractSignals, generateRubricSignals } from './claude-pipeline';

interface Env {
  RUBRICS_BUCKET: R2Bucket;
  ANTHROPIC_API_KEY: string;
}

const MAX_ATTEMPTS = 3;

const VALID_MODALITIES: AssessmentModality[] = [
  'pair_programming',
  'system_design',
  'code_review',
  'behavioral',
  'take_home',
  'technical_discussion',
  'presentation',
  'case_study',
];

/**
 * Normalize the modality string from Claude to match the frontend's enum.
 * Claude sometimes returns values like "technical discussion" or "System Design"
 * — we coerce to the underscore-lowercase form, falling back to technical_discussion
 * if the value is unrecognized.
 */
function normalizeModality(value: string | undefined): AssessmentModality {
  if (!value) return 'technical_discussion';
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if ((VALID_MODALITIES as string[]).includes(normalized)) {
    return normalized as AssessmentModality;
  }
  return 'technical_discussion';
}

/**
 * Generate a UUID v4 — Workers runtime supports crypto.randomUUID().
 */
function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Read the current status record from R2. Returns null if missing.
 */
async function readStatus(env: Env, jobId: string): Promise<StatusRecord | null> {
  const obj = await env.RUBRICS_BUCKET.get(R2_KEYS.status(jobId));
  if (!obj) return null;
  return obj.json<StatusRecord>();
}

/**
 * Write a status record to R2. Always uses application/json content type
 * so the Cloudflare dashboard renders it readably.
 */
async function writeStatus(env: Env, status: StatusRecord): Promise<void> {
  await env.RUBRICS_BUCKET.put(R2_KEYS.status(status.jobId), JSON.stringify(status), {
    httpMetadata: { contentType: 'application/json' },
  });
}

/**
 * Process a single message. Throws if processing should be retried;
 * returns normally if the message should be acknowledged.
 *
 * The caller (the queue handler) decides ack vs retry based on whether this throws.
 */
async function processMessage(message: Message<RubricJobMessage>, env: Env): Promise<void> {
  const { jobId, jdText } = message.body;

  // --- Step 1: Idempotency check ---
  // If we already wrote a result for this jobId, this is a duplicate delivery.
  // ack and skip — don't burn another Claude call.
  const existingResult = await env.RUBRICS_BUCKET.head(R2_KEYS.result(jobId));
  if (existingResult) {
    console.log('Idempotency hit — result already exists, skipping', { jobId });
    return;
  }

  // --- Step 2: Update status to 'running' ---
  const existingStatus = await readStatus(env, jobId);
  const now = new Date().toISOString();

  const runningStatus: StatusRecord = {
    jobId,
    status: 'running',
    createdAt: existingStatus?.createdAt ?? now,
    updatedAt: now,
    attempts: message.attempts,
  };
  await writeStatus(env, runningStatus);

  // --- Step 3: Two-stage Claude pipeline ---
  console.log('Starting extraction', { jobId, attempt: message.attempts });
  const extracted = await extractSignals(jdText, env.ANTHROPIC_API_KEY);

  console.log('Starting generation', { jobId, signalCount: extracted.signals.length });
  const generated = await generateRubricSignals(
    extracted.role,
    extracted.level,
    extracted.signals,
    env.ANTHROPIC_API_KEY
  );

  // --- Step 4: Build and write the final rubric ---
  // Shape matches the frontend's Rubric type exactly so no transformation is
  // needed on read. `id` and `jobId` are the same value — `id` is what the
  // existing RubricView consumes.
  const signals: RubricSignal[] = generated.signals.map((s) => ({
    id: uuid(),
    name: s.name,
    description: s.description ?? '',
    weight: s.weight,
    criteria: {
      exceeds: s.criteria?.exceeds ?? '',
      meets: s.criteria?.meets ?? '',
      below: s.criteria?.below ?? '',
    },
    suggestedModality: normalizeModality(s.suggestedModality),
    suggestedQuestions: s.suggestedQuestions ?? [],
  }));

  const rubric: RubricResult = {
    id: jobId,
    jobId,
    role: extracted.role,
    level: extracted.level,
    signals,
    createdAt: new Date().toISOString(),
    version: '1.0.0',
  };

  await env.RUBRICS_BUCKET.put(R2_KEYS.result(jobId), JSON.stringify(rubric), {
    httpMetadata: { contentType: 'application/json' },
  });

  // --- Step 5: Mark status as done ---
  const doneStatus: StatusRecord = {
    ...runningStatus,
    status: 'done',
    updatedAt: new Date().toISOString(),
    attempts: message.attempts,
  };
  await writeStatus(env, doneStatus);

  console.log('Job complete', { jobId, signalCount: rubric.signals.length });
}

/**
 * Write a failure status record. Called when we've exhausted retries.
 */
async function recordFailure(
  env: Env,
  jobId: string,
  error: unknown,
  attempts: number
): Promise<void> {
  const existing = await readStatus(env, jobId);
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);

  const failedStatus: StatusRecord = {
    jobId,
    status: 'failed' as JobStatus,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    attempts,
    error: message.slice(0, 500),
  };
  await writeStatus(env, failedStatus);
}

export default {
  /**
   * Queue handler — runs once per batch of messages from `rubric-jobs`.
   *
   * Configured in wrangler.jsonc:
   *   max_batch_size: 5
   *   max_batch_timeout: 10s
   *   max_retries: 3 (then DLQ)
   *
   * We process messages with Promise.allSettled so one slow/failing message
   * doesn't block the others in the batch.
   */
  async queue(batch: MessageBatch<RubricJobMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Processing batch of ${batch.messages.length} messages from queue ${batch.queue}`);

    const results = await Promise.allSettled(
      batch.messages.map(async (message) => {
        try {
          await processMessage(message, env);
          message.ack();
        } catch (err) {
          console.error('Message processing failed', {
            jobId: message.body.jobId,
            attempt: message.attempts,
            error: err instanceof Error ? err.message : String(err),
          });

          if (message.attempts >= MAX_ATTEMPTS) {
            // Exhausted retries — record failure status so the frontend stops polling
            // and acknowledge so the message routes to DLQ via max_retries config.
            await recordFailure(env, message.body.jobId, err, message.attempts);
            message.ack();
          } else {
            // Retry with exponential-ish backoff: 10s, 30s
            const delaySeconds = message.attempts === 1 ? 10 : 30;
            message.retry({ delaySeconds });
          }
        }
      })
    );

    // Promise.allSettled never rejects, but log any unexpected rejections for observability
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('Unexpected rejection in batch processing', r.reason);
      }
    }
  },
} satisfies ExportedHandler<Env>;
