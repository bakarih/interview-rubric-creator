# Architecture Decisions Record — Async Rubric Pipeline

Status: **Accepted** · Last updated: 2026-04-21

This document captures the load-bearing decisions behind the Cloudflare Queues + R2 pipeline that runs the Interview Rubric Creator's Claude workload asynchronously. It is meant to be read alongside the code in `workers/` and the Next.js integration in `src/app/api/jobs/`.

Each decision has three sections: **Context** (what was true when we made it), **Decision** (what we did), and **Consequences** (what we accept as a result).

---

## ADR-001: Move the Claude pipeline off the Next.js request path

### Context

The original implementation called `/api/extract` followed by `/api/generate` inline. Each rubric generation held an AWS App Runner instance for 15–70 seconds while Sonnet streamed. This had three problems:

- Long-lived connections on App Runner were expensive per-request and limited concurrency per instance.
- Any client disconnect (mobile network flap, tab close) wasted the Claude spend — there was no persistent record of the in-flight job.
- A retry story was impossible: if the App Runner instance died mid-request, the client got a 5xx and the partial work was gone.

### Decision

Introduce an async pipeline: a thin producer Worker accepts the job, writes a status record, enqueues a message, and returns `202 Accepted` with a `jobId` in under 1.5 seconds. A separate consumer Worker processes the queue, calls Claude, and writes the finished rubric to R2. The client polls for completion.

### Consequences

- **Accepted:** Two deployable artifacts to maintain (producer + consumer). Two `wrangler.jsonc` files, two `package.json` files.
- **Accepted:** Polling-based UX instead of streaming. The inline SSE-streaming flow is preserved behind a feature flag (`NEXT_PUBLIC_USE_ASYNC_PIPELINE`) so we can A/B between them or fall back.
- **Gained:** Client disconnects no longer waste Claude spend — the job runs to completion on the Worker and the result is durably stored in R2.
- **Gained:** Failed runs can be retried by the queue without any client involvement.
- **Gained:** App Runner instances can serve hundreds of concurrent rubric generations without holding long-lived connections.

---

## ADR-002: Two Workers instead of one

### Context

Cloudflare Workers can both serve HTTP and consume queues within a single Worker. We considered collapsing producer and consumer into one Worker to reduce deployment surface.

### Decision

Keep producer and consumer as separate Workers with separate `wrangler.jsonc` and separate bundles.

### Consequences

- **Accepted:** Two deployments per release. Two sets of bindings to configure.
- **Gained:** Operational flexibility — we can `wrangler queues pause-delivery rubric-jobs` to stop consumer work without affecting the producer's ability to accept new jobs (which will just queue up and drain when we resume).
- **Gained:** Independent scaling posture. The producer is a tiny stateless HTTP handler; the consumer is a heavier Claude-calling workload. They have different cold-start and memory profiles.
- **Gained:** Independent secret scoping. Only the consumer needs `ANTHROPIC_API_KEY`, reducing blast radius if the producer is ever compromised.
- **Gained:** Cleaner diffs when debugging — a producer log line is unambiguous about which Worker emitted it.

---

## ADR-003: R2 for both status tracking and result storage

### Context

We needed persistent state in two dimensions: current job status (queued / running / done / failed) and the final rubric. Candidates considered:

- **R2 only** — Object storage. Strong consistency on single-key writes. Cheap reads.
- **D1** — SQLite at the edge. Structured, but adds a schema migration story.
- **KV** — Eventually consistent. Fast reads globally, but consistency model is wrong for "did my job finish?" queries.
- **Durable Objects** — Strong consistency plus a programming model for single-writer state machines. Overkill for this scale.

### Decision

Use R2 exclusively. Status records are written to `status/{jobId}.json` and final rubrics to `rubrics/{jobId}.json`. Both are tiny (status ~150 bytes, rubric ~4-8 KB).

### Consequences

- **Accepted:** Every status poll is an R2 Class B read. At $0.36 per million Class B operations, a 2-second polling interval across a 60-second job is 30 reads per job — roughly $0.0000108 per job in read costs. Negligible.
- **Accepted:** R2 is eventually consistent across regions for listing but strongly consistent for single-key reads, which is exactly what polling needs.
- **Gained:** One operational surface instead of three. No D1 migrations, no KV namespace management, no Durable Object classes to deploy.
- **Gained:** Direct visibility — I can `wrangler r2 object get interview-rubrics status/{jobId}.json` from the CLI to debug any stuck job.

---

## ADR-004: Write status BEFORE sending to the queue

### Context

The producer's job-creation endpoint does two side-effecting operations: (1) write a status record to R2 and (2) send a message to the queue. The order matters.

If we enqueue first and then write status, there's a race: the consumer can pick up the message and start processing before the producer has written `status: queued`. Any client that polls during that window gets a 404 for a job that is actively running.

### Decision

Write `status: queued` to R2 first. Then send to the queue. If the queue send fails, overwrite the status with `status: failed` so the client's poll loop terminates instead of hanging.

### Consequences

- **Accepted:** Slightly higher p50 latency on the producer's response (one extra R2 write before the enqueue).
- **Accepted:** A failure path (status write succeeds, queue send fails) requires the cleanup overwrite. Implemented explicitly in `producer/src/index.ts`.
- **Gained:** Polling is never racy. Once the producer returns 202 with a `jobId`, the client can immediately GET `/jobs/:jobId` and receive a valid status.

---

## ADR-005: At-least-once delivery + idempotency check in the consumer

### Context

Cloudflare Queues provides at-least-once delivery. Any given message can be redelivered if the consumer crashes mid-processing, if the Worker hits an unexpected runtime error, or if the DLQ routing logic determines a retry is warranted. Without an idempotency check, a duplicate delivery means a second call to Claude — doubled spend on no additional value.

### Decision

Before calling Claude, the consumer does `R2.head('rubrics/{jobId}.json')`. If the result object already exists, the consumer immediately acks the message and returns. If not, it proceeds with the pipeline.

### Consequences

- **Accepted:** One extra R2 Class B request per message. At current pricing this is effectively free.
- **Gained:** Duplicate deliveries cost one R2 head request instead of ~60 seconds of Sonnet time. At worst-case Sonnet pricing, this saves on the order of $0.10 per duplicate delivery.
- **Gained:** The system is safely resumable. A consumer deploy-in-progress that kills in-flight messages mid-processing will, on redelivery, correctly skip any that completed before the kill.

---

## ADR-006: Per-message ack/retry instead of `batch.ackAll()`

### Context

Cloudflare's queue handler receives a batch (`max_batch_size: 5`). The SDK provides both `batch.ackAll()` (batch-level acknowledgment) and per-message `message.ack()` / `message.retry()`.

If we use `ackAll()` and one message in the batch throws, we either lose the other four (if we let the error propagate and the whole batch retries) or we silently discard the failed one. Neither is acceptable.

### Decision

Wrap every message in its own try/catch inside a `Promise.allSettled` block. Each message individually calls `ack()` on success or `retry({ delaySeconds })` on failure.

### Consequences

- **Accepted:** A few more lines of code in the handler than `ackAll()` would need.
- **Gained:** Failure isolation. One bad JD (say, one that triggers a prompt-injection classifier) doesn't poison the other four messages in the batch.
- **Gained:** Targeted retry delays. Each failed message can carry its own backoff (currently 10s on first failure, 30s on second).

---

## ADR-007: Exponential-ish retry with DLQ after 3 attempts

### Context

Anthropic's API returns 429s under heavy concurrent load. Retrying immediately makes the rate-limit problem worse. Retrying never is also wrong — a transient network blip shouldn't mark a job as permanently failed.

### Decision

Retry with 10s then 30s delays. After three total attempts, route the message to the `rubric-jobs-dlq` DLQ (configured via `max_retries: 3` in `consumer/wrangler.jsonc`). The consumer's catch-all handler also writes a `status: failed` record to R2 so the frontend's poll loop terminates.

### Consequences

- **Accepted:** A severely rate-limited Anthropic backend means jobs take up to ~40 seconds of wall-clock time beyond the Claude call itself before surfacing as failed. This is acceptable for the UX.
- **Accepted:** The DLQ is currently manual-only — we inspect it in the Cloudflare dashboard. A future DLQ-consumer Worker that persists failed messages to `rubrics/failed/{jobId}.json` is in the "next steps" list.
- **Gained:** No tight retry loops hammering Anthropic. No jobs that hang in a "running" state forever.

---

## ADR-008: Raw `fetch()` to Anthropic instead of `@anthropic-ai/sdk`

### Context

The Next.js side uses `@anthropic-ai/sdk` version 0.80. The Workers runtime is a V8 isolate environment, not Node — it doesn't ship Node built-ins like `stream`, `http`, or `Buffer` by default. Some SDK dependencies can be polyfilled, but it adds bundle weight.

### Decision

In the consumer, call Anthropic's Messages API with raw `fetch()`. Inline the prompt construction. No SDK dependency.

### Consequences

- **Accepted:** Two places where the API request shape is defined — Next.js (via SDK) and Worker (raw fetch). If Anthropic changes the Messages API, we update both.
- **Accepted:** We lose SDK conveniences: typed responses, built-in streaming helpers, automatic retry on network errors.
- **Gained:** Smaller Worker bundle (matters for cold-start time on the consumer).
- **Gained:** Portability — the consumer's Claude call logic is a single 30-line function (`generateRubricSignals` in `consumer/src/claude-pipeline.ts`) that could be lifted into any runtime.

---

## ADR-009: Prompts inlined in the consumer, not imported from `src/lib/`

### Context

The Next.js app has its prompts in `src/lib/prompts/` — nicely organized, reviewed, and tested. The consumer Worker needs the same prompts. The obvious instinct is "just import them."

But the Worker is a separate deployable unit. Wrangler bundles the Worker from its own `src/` directory. Reaching up into the Next.js tree would require either a monorepo build tool (nx, turborepo, pnpm workspaces), symlinks, or a `prompts` package published to a shared registry.

### Decision

Duplicate the prompt strings inline in `consumer/src/claude-pipeline.ts`. Keep the structure (system prompt, user prompt, response schema description) aligned with the Next.js version by convention and code review.

### Consequences

- **Accepted:** Prompt drift is a real risk. If someone updates the extraction prompt on the Next.js side and forgets the Worker, the two flows produce different outputs.
- **Accepted:** This mitigates automatically over time — the feature flag `NEXT_PUBLIC_USE_ASYNC_PIPELINE=true` means the Worker's prompts are increasingly the ones actually used in production, so they get maintenance attention.
- **Deferred:** A shared `prompts` package (published private via GitHub Packages, or extracted to a monorepo) is the correct long-term answer. Today, the working system beats the theoretically cleaner one.

---

## ADR-010: `max_batch_size: 5`, `max_batch_timeout: 10s`

### Context

Cloudflare Queues lets the consumer process multiple messages in one invocation. Larger batches mean higher throughput but longer worst-case latency per message. Smaller batches mean more invocations (more cold-start risk) but lower per-message latency.

The Claude call is the dominant latency cost — Haiku extraction takes 2-5s, Sonnet generation takes 15-60s. The rest of the pipeline is noise.

### Decision

`max_batch_size: 5`, `max_batch_timeout: 10s`. A batch of 5 messages runs the Claude pipeline in parallel via `Promise.allSettled`, so the batch's wall-clock time is roughly `max(per-message times)`, not the sum.

### Consequences

- **Accepted:** If the queue depth is shallow (1-2 messages), the consumer waits up to 10 seconds for the batch to fill before processing. This adds latency to low-traffic jobs.
- **Accepted:** Five concurrent Claude calls per Worker invocation could push us into Anthropic rate limits during burst traffic. The retry logic (ADR-007) handles this.
- **Gained:** Steady-state efficiency — at moderate queue depth, the consumer processes 5 jobs per invocation without linear scaling of cold starts.

---

## ADR-011: Feature flag toggles between async pipeline and inline streaming

### Context

The inline SSE streaming flow (Next.js `/api/extract` + `/api/generate` with progressive signal render) was already working when the async pipeline was introduced. It has a real UX advantage: users see signals appear one-by-one as Sonnet generates them, which feels faster than a single "done" event at the end of 60 seconds.

We did not want to delete the streaming flow. We also did not want a fork in the codebase.

### Decision

Both flows live in the same `page.tsx`. A client-side environment variable, `NEXT_PUBLIC_USE_ASYNC_PIPELINE`, selects between `runAsyncFlow()` and `runInlineFlow()`. The user sees one button; the implementation chooses the path.

### Consequences

- **Accepted:** Two code paths to maintain in `page.tsx`. Both paths share the same `Rubric` output type, so the downstream UI is unchanged.
- **Gained:** Instant rollback. If the async pipeline has an incident, flip the flag to `false` and redeploy Next.js (no Worker changes needed).
- **Gained:** A/B capable. We can set the flag per-cohort in the future to compare conversion or completion rates between flows.

---

## Tuning knobs (at a glance)

| Knob | Current value | Where | Raise if... | Lower if... |
|---|---|---|---|---|
| `max_batch_size` | 5 | `consumer/wrangler.jsonc` | Throughput becomes the bottleneck | Anthropic rate limits start hurting |
| `max_batch_timeout` | 10s | `consumer/wrangler.jsonc` | Low-traffic latency is OK | Polling UX feels too slow to start |
| `max_retries` | 3 | `consumer/wrangler.jsonc` | Transient errors are common | We want to surface failures faster |
| Retry delays | 10s, 30s | `consumer/src/index.ts` | Anthropic is frequently rate-limiting us | We want faster failure feedback |
| Polling interval | 2s | `src/lib/utils/asyncPipeline.ts` | The status-poll load becomes noticeable | Users complain about UI staleness |

---

## Open questions (for future work)

- Structured logging across producer and consumer so log searches can correlate by `jobId`.
- OpenTelemetry tracing from Next.js → producer → queue → consumer → Claude for end-to-end latency visibility.
- A DLQ-consumer Worker that persists failed messages to `rubrics/failed/{jobId}.json` so we can inspect and replay.
- Per-account (or per-IP) rate limiting in the producer. Currently the Next.js proxy is the only rate-limit layer.
- Admin endpoint to replay DLQ messages back onto the main queue.
