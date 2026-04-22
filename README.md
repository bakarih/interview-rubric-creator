# Interview Rubric Creator

An AI-powered web application that transforms job descriptions into structured, weighted interview rubrics. Paste or upload a job description, and the app uses Claude to extract key hiring signals and generate a complete rubric with criteria, suggested questions, and assessment modalities — ready to export as PDF or DOCX.

## How It Works

The app supports two generation pipelines, toggled by a feature flag:

### Inline Pipeline (default)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          User Interface                                │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐ │
│   │ Upload File   │    │  Paste Text  │    │  View & Export Rubric    │ │
│   │ (PDF/DOCX/TXT)│    │              │    │  (PDF / DOCX download)   │ │
│   └──────┬───────┘    └──────┬───────┘    └────────────▲─────────────┘ │
└──────────┼───────────────────┼─────────────────────────┼───────────────┘
           ▼                   ▼                         │
    ┌─────────────┐    ┌─────────────┐                   │
    │  /api/parse  │───▶│ /api/extract│                   │
    │  Extract raw │    │  Claude AI  │                   │
    │  text        │    │  identifies │                   │
    └─────────────┘    │  role, level,│                   │
                       │  signals    │                   │
                       └──────┬──────┘                   │
                              ▼                          │
                       ┌─────────────┐           ┌──────┴──────┐
                       │/api/generate │           │ /api/export  │
                       │  Claude SSE  │──────────▶│  PDF / DOCX  │
                       │  streams     │  stored   └──────────────┘
                       │  rubric      │  client-side
                       └─────────────┘
```

1. **Input** — Upload a PDF, DOCX, or TXT file, or paste the job description text directly
2. **Parse** — The server extracts raw text from uploaded files
3. **Extract** — Claude Haiku analyzes the text and identifies the role, seniority level, and 5–10 key hiring signals (30s timeout)
4. **Generate** — Claude Sonnet streams the rubric back signal-by-signal via SSE (90s timeout). Each signal gets a weight (1–10), criteria for exceeds/meets/below expectations, a suggested assessment modality, and 2–3 interview questions
5. **Export** — Download the rubric as a formatted PDF or DOCX document

### Async Pipeline (Cloudflare Queues + R2, feature-flagged)

When `NEXT_PUBLIC_USE_ASYNC_PIPELINE=true`, the app routes generation through a two-Worker Cloudflare architecture. The JD is enqueued and processed asynchronously — the UI polls for completion while the Consumer Worker runs the Claude pipeline and writes results to R2.

```
Browser → Next.js /api/jobs → Producer Worker → Queue rubric-jobs → Consumer Worker → Claude → R2
   ▲                ▲                                                                         │
   └── poll status ─┴─────────────────── reads from R2 ────────────────────────────────────────┘
```

- **Producer Worker** — HTTP edge layer. Writes status to R2, enqueues message, returns `jobId` in <1.5s.
- **Consumer Worker** — Queue-triggered. Runs two-stage Claude pipeline (Haiku extract → Sonnet generate), writes rubric to R2.
- **DLQ** — `rubric-jobs-dlq` with `max_retries: 3` and exponential backoff.
- **Idempotency** — Consumer checks `R2.head(result key)` before calling Claude; duplicate deliveries are safely skipped.

See [`workers/README.md`](./workers/README.md) for deployment instructions and [`workers/ADR.md`](./workers/ADR.md) for the full architecture decisions record (11 ADRs).

## Getting Started

### Prerequisites

- **Node.js** 20 or later
- **Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com)

### Installation

```bash
git clone https://github.com/bakarih/interview-rubric-creator.git
cd interview-rubric-creator
npm install
cp .env.example .env.local
```

Edit `.env.local` and add your API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running Tests

```bash
npm test              # Unit and integration tests
npm run test:coverage # With coverage report (100% enforced)
npm run test:e2e      # End-to-end tests (requires Playwright)
```

### Production Build

```bash
npm run build
npm start
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) | Full-stack React framework with SSR |
| Language | [TypeScript 5](https://www.typescriptlang.org/) | Type safety across the codebase |
| AI | [Claude Sonnet 4 & Haiku 4](https://docs.anthropic.com/) via Anthropic SDK | Job description analysis and rubric generation |
| Styling | [Tailwind CSS](https://tailwindcss.com/) with Geist fonts | Utility-first CSS with dark mode support |
| Validation | [Zod 3](https://zod.dev/) | Runtime schema validation for all inputs and outputs |
| PDF Export | [@react-pdf/renderer](https://react-pdf.org/) | PDF document generation with React components |
| DOCX Export | [docx](https://docx.js.org/) | Word document generation |
| File Parsing | [pdf-parse](https://www.npmjs.com/package/pdf-parse), [mammoth](https://www.npmjs.com/package/mammoth) | PDF and DOCX text extraction |
| IDs | [uuid](https://www.npmjs.com/package/uuid) | Unique identifier generation |
| Testing | [Jest](https://jestjs.io/), [Testing Library](https://testing-library.com/), [Playwright](https://playwright.dev/) | Unit, integration, and E2E testing |
| Hosting | [AWS App Runner](https://aws.amazon.com/apprunner/) | Production deployment with auto-deploy from GitHub |
| Async Pipeline | [Cloudflare Workers](https://workers.cloudflare.com/), [Queues](https://developers.cloudflare.com/queues/), [R2](https://developers.cloudflare.com/r2/) | Feature-flagged async generation pipeline |

## Features

- **AI-powered extraction** — Automatically identifies role, seniority level, requirements, and key hiring signals from any job description
- **Weighted rubric generation** — Each signal receives a weight (1–10), pass/fail criteria across three levels, a suggested assessment modality, and tailored interview questions
- **Multiple input methods** — Upload PDF, DOCX, or TXT files, or paste text directly
- **PDF and DOCX export** — Download formatted rubrics with color-coded criteria tables
- **Real-time streaming** — Watch as signals are progressively generated and rendered via Server-Sent Events (inline pipeline)
- **Async pipeline** — Cloudflare Queues + R2 architecture for durable, retry-safe generation (feature-flagged)
- **Shareable URLs** — Each rubric gets a unique URL for easy sharing
- **Dark/light mode** — Theme toggle with system preference detection and localStorage persistence
- **WCAG 2.1 AA accessible** — Skip navigation, keyboard support, ARIA labels, focus management, reduced motion support
- **Feedback system** — In-app feedback button linking to GitHub issues
- **Client-side timeout handling** — Extraction (30s) and generation (90s) timeouts with user-friendly error messages

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── api/
│   │   ├── parse/              # File text extraction
│   │   ├── extract/            # Claude: JD → structured signals
│   │   ├── generate/           # Claude: signals → weighted rubric (SSE stream)
│   │   ├── export/             # Rubric → PDF/DOCX binary
│   │   └── jobs/               # Proxy to Cloudflare producer Worker (async pipeline)
│   │       └── [jobId]/        # Poll job status from producer Worker
│   ├── rubric/[id]/            # Dynamic rubric view page
│   ├── page.tsx                # Home page — feature-flag routes to inline or async flow
│   ├── layout.tsx              # Root layout with theme support
│   └── globals.css             # Tailwind styles
├── components/
│   ├── common/                 # ThemeToggle, LoadingSpinner, ErrorMessage, FeedbackButton
│   ├── export/                 # ExportButtons (PDF/DOCX)
│   ├── rubric/                 # RubricView, SignalCard, WeightBadge
│   └── upload/                 # FileUpload (drag-drop), TextInput
├── lib/
│   ├── claude/                 # Anthropic client + prompt templates
│   ├── parsers/                # PDF, DOCX, TXT parsers
│   ├── utils/
│   │   └── asyncPipeline.ts    # Client polling utility (AbortSignal, 2s interval, 90s timeout)
│   └── validation/             # Zod schemas
├── types/                      # TypeScript interfaces (Rubric, Signal, JD)
└── workers/                    # Cloudflare Workers async pipeline
    ├── producer/               # HTTP edge Worker — accepts jobs, enqueues, exposes status
    ├── consumer/               # Queue-triggered Worker — runs Claude pipeline, writes to R2
    ├── shared/                 # Shared types (message contract, R2 key conventions)
    ├── README.md               # Workers deployment guide
    └── ADR.md                  # 11 Architecture Decisions Records
```

### Key Design Decisions

- **Two pipelines, one feature flag** — `NEXT_PUBLIC_USE_ASYNC_PIPELINE` toggles between inline SSE streaming and the Cloudflare async pipeline. Both paths share the same `Rubric` output type; downstream components are unchanged.
- **Stateless API** — No database; rubrics are stored client-side in localStorage. This keeps infrastructure simple and costs low.
- **Server-Sent Events** — The inline pipeline streams signals as they're created, providing immediate feedback during the 20–30s generation process.
- **Async pipeline durability** — Cloudflare Queues provides at-least-once delivery with DLQ after 3 retries. The consumer uses `R2.head()` for idempotency — duplicate deliveries skip the Claude call and ack cleanly.
- **Status-before-enqueue** — The producer writes `status: queued` to R2 before sending to the queue, eliminating the race where a client polls before status exists.
- **In-memory file processing** — Uploaded files are parsed in-memory and never persisted to disk or cloud storage.
- **Zod validation everywhere** — All API inputs and Claude responses are validated at runtime, catching malformed data before it causes issues.
- **AbortController timeouts** — Both pipeline fetch calls carry configurable client-side timeouts (30s for extraction, 90s for generation); the Anthropic SDK is configured with a 120s server-side timeout.
- **Standalone Next.js output** — The build produces a self-contained server for containerized deployment.

## API Reference

### POST /api/parse
Extracts text content from uploaded files.
**Request**: `multipart/form-data` with a `file` field | **Response**: `{ text: string }` | **Supported**: PDF, DOCX, TXT (max 5MB)

### POST /api/extract
Analyzes job description text and extracts structured information.
**Request**: `{ text: string }` | **Response**: Job description with role, level, and signals | **Model**: Claude Haiku 4

### POST /api/generate
Transforms extracted signals into a complete interview rubric via SSE.
**Request**: `{ role, level, signals }` | **Response**: SSE stream of `signal` events | **Model**: Claude Sonnet 4

### POST /api/export
Exports rubric as PDF or DOCX.
**Request**: `{ rubric: Rubric, format: 'pdf' | 'docx' }` | **Response**: Binary file download

### POST /api/jobs *(async pipeline)*
Submits a rubric job to the Cloudflare producer Worker.
**Request**: `{ jdText: string }` | **Response**: `{ jobId: string, status: 'queued' }`

### GET /api/jobs/[jobId] *(async pipeline)*
Polls job status from the producer Worker.
**Response**: `{ status: 'queued' | 'running' | 'done' | 'failed', rubric?: Rubric }`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Your Anthropic API key |
| `RUBRIC_PRODUCER_URL` | Async pipeline only | — | Cloudflare producer Worker URL |
| `NEXT_PUBLIC_USE_ASYNC_PIPELINE` | No | `false` | Set to `"true"` to enable the Cloudflare async pipeline |
| `NEXT_PUBLIC_BASE_URL` | No | `http://localhost:3000` | Base URL for the application |
| `MAX_FILE_SIZE_MB` | No | `5` | Maximum upload file size in MB |
| `RATE_LIMIT_MAX` | No | `10` | Max API requests per window |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds |

## Deployment

The app is deployed on **AWS App Runner** with auto-deploy from the `main` branch.

- **URL**: `https://memkykjmiu.us-east-1.awsapprunner.com`
- **Runtime**: Node.js 22
- **Instance**: 1 vCPU, 2 GB RAM
- **Build**: `npm ci && npm run build` (standalone output)
- **Budget**: $30/month ceiling with email alerts at 83%

For the Cloudflare async pipeline deployment, see [`workers/README.md`](./workers/README.md).

## Contributing

We welcome contributions from everyone — no coding required. See [CONTRIBUTING.md](CONTRIBUTING.md) for all the ways you can help, from sharing feedback to submitting code.

## Why I Built This

Interview evaluation is an assessment problem — and most teams are solving it without the tools that educators figured out decades ago.

I've seen this from every angle. As an interviewer, I've sat on panels where everyone walked away with different impressions of the same candidate — not because we disagreed, but because we were measuring different things. As a candidate, I've experienced interviews where the success criteria felt invisible until the rejection email arrived.

But before I was an engineering manager, I spent over a decade as an educator. I studied authentic assessment and standards-based learning — approaches built on a simple insight: when you make success criteria explicit and observable, evaluation becomes fairer and learning becomes clearer.

The same principles apply whether you're grading a physics lab or interviewing a senior engineer. Define what "good" looks like *before* you start evaluating. Make the rubric visible to everyone. Align your panel on what you're actually measuring.

My MS research in AI and my work teaching technical interview prep at CodePath gave me the tools to finally build something. I architected and shipped this MVP in 3 days using Claude Code, GitHub Actions, and AWS App Runner — then evolved it onto a Cloudflare Queues + R2 async pipeline.

This is my attempt to bring those insights into hiring — and I'm building it in public.

— [Bakari Holmes](https://linkedin.com/in/bakariholmes)

## License

[MIT License](LICENSE) — free to use, modify, and distribute.
