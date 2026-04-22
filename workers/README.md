# Workers — Async Rubric Pipeline (R2 + Queues)

This directory contains two Cloudflare Workers that move the long-running Claude pipeline off the Next.js critical path:

- **`producer/`** — HTTP edge layer. Accepts rubric requests, enqueues them, exposes status polling.
- **`consumer/`** — Pulls messages off the queue, runs the two-stage Claude pipeline, writes results to R2.
- **`shared/`** — Shared TypeScript types (message contract, status schema, R2 key conventions).

## Architecture at a glance

```
Browser → Next.js → Producer Worker → Queue → Consumer Worker → Claude → R2
   ▲                     ▲                                                │
   └─── poll status ─────┴───── reads from R2 ─────────────────────────────┘
```

**Why this exists:** the original Next.js `/api/extract` + `/api/generate` routes
ran the full Claude pipeline inline (15-30 seconds per request), holding the
App Runner instance the whole time. The new flow returns a `jobId` in <200ms
and runs the work asynchronously on Workers + Queues, with results persisted
to R2 for durable, polling-based retrieval.

## Architectural decisions worth defending in interviews

| Decision | Trade-off |
|----------|-----------|
| **Two Workers (producer + consumer) instead of one** | Better separation of concerns; producer can scale independently of consumer; consumer can be paused (`wrangler queues pause-delivery`) without losing requests. Cost: two deployments, two `wrangler.jsonc` files. |
| **R2 holds both status AND result** | Avoids needing D1 or KV for this minimal app. Status object is tiny (~150 bytes) so polling is cheap. Cost: result reads cost an R2 Class B operation. |
| **Status written BEFORE queue send** | Polling never returns 404 for a job we've accepted. If queue send fails, we mark status as `failed` so polling doesn't hang. Cost: a successful status write followed by a failed enqueue requires the cleanup path. |
| **At-least-once + idempotency check in consumer** | Honest about Queues' delivery guarantee. Consumer does `R2.head(result key)` before calling Claude — if the result exists, we ack and skip. Saves money on duplicate Claude calls. |
| **`Promise.allSettled` in the queue handler** | One slow/failing message doesn't block the other 4 in the batch. Each message gets its own try/catch and ack/retry decision. |
| **Per-message `ack()` / `retry()` instead of `batch.ackAll()`** | Failures are isolated. A single bad JD doesn't poison the whole batch. |
| **Exponential-ish retry delays (10s, 30s)** | Backoff gives downstream Anthropic API time to recover from rate limits without hammering it. After 3 attempts, we route to DLQ via `max_retries: 3`. |
| **DLQ writes a failed status to R2** | When we exhaust retries, the frontend doesn't poll forever — it sees `status: 'failed'` with the error message. |
| **Raw `fetch()` to Anthropic instead of `@anthropic-ai/sdk`** | Workers don't ship Node built-ins. Raw fetch keeps the bundle small and cold-starts fast. We trade some convenience for portability. |
| **Prompts inlined in the consumer (not imported from `src/lib/`)** | The Worker is a separate deployable artifact. Coupling it to the Next.js source tree at build time would require either a monorepo build tool or symlinks. We accept the duplication. |
| **`max_batch_size: 5`, `max_batch_timeout: 10s`** | Tuned for ~5-15s Claude calls. Larger batches mean longer total processing time per invocation. Smaller timeouts trade throughput for latency. |

## One-time setup

You need:
- Cloudflare account with Workers paid plan (Queues requires it)
- `wrangler` CLI installed (`npm install -g wrangler`)
- Anthropic API key

```bash
# 1. Auth
wrangler login

# 2. Create the queue and DLQ
wrangler queues create rubric-jobs
wrangler queues create rubric-jobs-dlq

# 3. Create the R2 bucket
wrangler r2 bucket create interview-rubrics

# 4. Install per-worker dependencies
cd workers/producer && npm install && cd ../..
cd workers/consumer && npm install && cd ../..
```

## Setting the Anthropic secret on the consumer

Secrets are scoped per-Worker. The producer doesn't need it (only the consumer
calls Claude), so we set it only on the consumer:

```bash
cd workers/consumer
wrangler secret put ANTHROPIC_API_KEY
# Paste your key when prompted, then press Enter.
```

To rotate the key later, run the same command again — it overwrites the existing value.

## Local development

You can run both Workers locally with hot reload. Open two terminals:

```bash
# Terminal 1 — producer (serves on http://localhost:8787)
cd workers/producer
npm run dev

# Terminal 2 — consumer (pulls from local queue + writes to local R2)
cd workers/consumer
npm run dev
```

Wrangler simulates Queues and R2 locally by default, so you can iterate without
deploying. To test the full pipeline:

```bash
curl -X POST http://localhost:8787/jobs \
  -H 'Content-Type: application/json' \
  -d '{"jdText": "Senior Frontend Engineer at Acme. React, TypeScript, Next.js. 5+ years experience."}'

# Returns: { "jobId": "...", "status": "queued" }

# Poll:
curl http://localhost:8787/jobs/<jobId>
```

## Deploying to production

```bash
# Producer
cd workers/producer
npm run deploy
# Note the *.workers.dev URL it prints — that's the producer's public endpoint.

# Consumer (must be deployed AFTER the producer so the queue exists)
cd workers/consumer
npm run deploy
```

Then update the Next.js `.env.local`:

```bash
RUBRIC_PRODUCER_URL=https://rubric-producer.<your-account>.workers.dev
```

## Observability

```bash
# Stream live logs from the producer
cd workers/producer && npm run tail

# Stream live logs from the consumer
cd workers/consumer && npm run tail

# Inspect queue depth and metrics
wrangler queues info rubric-jobs

# Pause delivery (e.g., to roll out a consumer fix without losing messages)
wrangler queues pause-delivery rubric-jobs
wrangler queues resume-delivery rubric-jobs

# List recent messages from the dashboard (browser, not CLI)
# https://dash.cloudflare.com → Workers & Pages → Queues → rubric-jobs

# Inspect what's in the DLQ
wrangler queues consumer add rubric-jobs-dlq <some-debug-worker>
# (or use the dashboard "List messages" feature on the DLQ)
```

## Frontend integration (Next.js side)

The Next.js app needs two updates:

1. A new API route (`src/app/api/jobs/route.ts`) that proxies to the producer Worker.
2. Frontend code that submits a JD, gets a `jobId`, and polls `/api/jobs/:jobId` until status is `done` or `failed`.

The proxy is a 10-line route — see `docs/integration.md` (TODO) for the snippet,
or just point the frontend directly at the producer Worker URL if you don't need
a same-origin abstraction.

## What I'd do next (not done yet)

- [ ] Add a `pino`-style structured logger so logs are filterable in Cloudflare's log explorer
- [ ] Add OpenTelemetry tracing across producer → queue → consumer for end-to-end latency visibility
- [ ] Add a separate DLQ-consumer Worker that writes failed messages to R2 at `rubrics/failed/{jobId}.json` for inspection
- [ ] Add per-account rate limiting in the producer (currently relies on the Next.js layer)
- [ ] Add a basic admin endpoint to re-enqueue messages from the DLQ
