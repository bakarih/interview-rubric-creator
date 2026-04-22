/**
 * Shared types for the producer and consumer Workers.
 *
 * Both Workers import from this file so the message contract stays in one place.
 * If you change a field here, both Workers need to be redeployed.
 */

/**
 * Job status values that get written to R2 at `rubrics/status/{jobId}.json`.
 * The frontend polls these via the producer's GET endpoint.
 */
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

/**
 * Status object stored in R2. Cheap to read for polling — does NOT contain the rubric itself.
 */
export interface StatusRecord {
  jobId: string;
  status: JobStatus;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  attempts: number;
  /** Present when status === 'failed' */
  error?: string;
}

/**
 * The message body sent to the rubric-jobs queue.
 *
 * Keep this small — Queues has a 128 KB per-message limit, and we don't want
 * to bloat the queue with payloads. JD text up to ~100 KB is fine.
 */
export interface RubricJobMessage {
  jobId: string;
  jdText: string;
  /** ISO timestamp of when the producer enqueued the job */
  enqueuedAt: string;
}

/**
 * Assessment modalities — mirrors src/types/rubric.ts in the Next.js app.
 * If you add a new modality here, add it to both places.
 */
export type AssessmentModality =
  | 'pair_programming'
  | 'system_design'
  | 'code_review'
  | 'behavioral'
  | 'take_home'
  | 'technical_discussion'
  | 'presentation'
  | 'case_study';

/**
 * Signal shape — matches the frontend's Signal type exactly so RubricView
 * renders without needing any transformation on read.
 */
export interface RubricSignal {
  id: string;
  name: string;
  description: string;
  weight: number;
  criteria: {
    exceeds: string;
    meets: string;
    below: string;
  };
  suggestedModality: AssessmentModality;
  suggestedQuestions: string[];
}

/**
 * The final rubric result stored at `rubrics/results/{jobId}.json`.
 *
 * Shape mirrors the Rubric type from src/types/rubric.ts. The `id` field is the
 * jobId (they're the same identifier once a result exists) — this lets the
 * existing RubricView component consume the result without remapping.
 */
export interface RubricResult {
  id: string;           // same as jobId, named `id` for compat with frontend Rubric type
  jobId: string;
  role: string;
  level: string;
  signals: RubricSignal[];
  createdAt: string;
  version: string;
}

/**
 * R2 key conventions. Centralizing these prevents typos that cause "missing object" bugs.
 */
export const R2_KEYS = {
  status: (jobId: string) => `rubrics/status/${jobId}.json`,
  result: (jobId: string) => `rubrics/results/${jobId}.json`,
  failed: (jobId: string) => `rubrics/failed/${jobId}.json`,
} as const;
