# Architecture

## Overview

Interview Rubric Creator is a Next.js application that uses Claude AI (claude-sonnet-4-6 and claude-haiku-4-5-20251001) to transform job descriptions into structured interview rubrics. It runs as a stateless server — no database, no cloud storage — with all rubric data stored client-side in localStorage.

The application supports two processing modes:
- **Inline Pipeline** — Real-time streaming generation via Next.js API routes
- **Async Pipeline** — Queue-based processing via Cloudflare Workers, Queues, and R2

## Data Flow

### Inline Pipeline (Default)
```
User Input                    Server (API Routes)                     External
──────────                    ───────────────────                     ────────

┌──────────┐
│  Upload   │──── FormData ───▶ POST /api/parse
│  file     │                   │ pdf-parse / mammoth / Buffer
└──────────┘                    │ returns { text }
                                ▼
┌──────────┐              POST /api/extract
│  Paste    │──── JSON ──▶  │ Validates with Zod (TextInputSchema)
│  text     │               │ Sends text to Claude ──────────────▶ Anthropic API
└──────────┘               │ (claude-haiku-4-5-20251001)        (faster extraction)
                            │ Strips markdown fences
                            │ Parses JSON response
                            │ Returns JobDescription + signals
                            ▼
                       POST /api/generate (SSE streaming)
                        │ Validates role, level, signals
                        │ Sends to Claude ───────────────────▶ Anthropic API
                        │ (claude-sonnet-4-6)                 (higher quality generation)
                        │ Streams signals as individual JSON objects
                        │ Assigns UUIDs to each signal
                        │ Returns complete Rubric via SSE
                        ▼
                  ┌─────────────┐
                  │  localStorage │◀── Rubric stored client-side
                  └──────┬──────┘
                         │
                         ▼
                   POST /api/export
                    │ Receives Rubric + format
                    │ Generates PDF (@react-pdf/renderer)
                    │   or DOCX (docx library)
                    │ Returns binary file download
                    ▼
               ┌──────────┐
               │ PDF/DOCX  │
               │ download  │
               └──────────┘
```

### Async Pipeline (Feature Flag)
```
User Input                    Server (API Routes)               External Services
──────────                    ───────────────────               ─────────────────

┌──────────┐                  POST /api/jobs
│  Submit   │──── JSON ──────▶ │ Proxy to Cloudflare Worker ──▶ Worker + Queues
│  JD text  │                  │ Returns { jobId, status }      │ (Extract + Generate)
└──────────┘                  ▼                                 │ Stores to R2
                          GET /api/jobs/:jobId                   ▼
                           │ Poll every 2s for status ───────▶ R2 Storage
                           │ Returns status/rubric/error       (Status + Rubric)
                           ▼
                    ┌─────────────┐
                    │  localStorage │◀── Rubric stored client-side
                    └──────┬──────┘
                           │
                           ▼
                     POST /api/export (same as inline)
```

## Module Structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── parse/route.ts        # File → raw text (pdf-parse/mammoth)
│   │   ├── extract/route.ts      # Text → JobDescription (Claude Haiku)
│   │   ├── generate/route.ts     # Signals → Rubric (Claude Sonnet, SSE streaming)
│   │   ├── export/route.ts       # Rubric → PDF/DOCX binary
│   │   ├── version/route.ts      # Deploy info endpoint (commit SHA, timestamp)
│   │   └── jobs/
│   │       ├── route.ts          # POST proxy to Cloudflare Worker
│   │       └── [jobId]/route.ts  # GET poll async job status
│   ├── rubric/[id]/page.tsx      # Dynamic rubric view with localStorage loading
│   ├── page.tsx                  # Home page with dual-mode pipeline support
│   ├── layout.tsx                # Root layout with Geist fonts, theme toggle, feedback button
│   └── globals.css               # Tailwind + accessibility styles
├── components/
│   ├── common/
│   │   ├── ThemeToggle.tsx       # Dark/light mode with localStorage
│   │   ├── LoadingSpinner.tsx    # Animated loading with status messages
│   │   ├── ErrorMessage.tsx      # Error display with retry, focus management
│   │   └── FeedbackButton.tsx    # GitHub feedback menu (templated issues)
│   ├── export/
│   │   └── ExportButtons.tsx     # PDF/DOCX download with loading states
│   ├── rubric/
│   │   ├── RubricView.tsx        # Full rubric display with sorted signals
│   │   ├── SignalCard.tsx        # Individual signal with criteria table
│   │   └── WeightBadge.tsx       # Color-coded weight indicator (green ≥7, blue ≥4, gray <4)
│   └── upload/
│       ├── FileUpload.tsx        # Drag-and-drop with keyboard support
│       └── TextInput.tsx         # Textarea with character counter (max 50,000)
├── lib/
│   ├── claude/
│   │   ├── client.ts             # Anthropic SDK singleton (120s timeout) + completion wrapper
│   │   ├── index.ts              # Re-exports from client and prompts
│   │   └── prompts/
│   │       ├── index.ts          # Re-exports from all prompt files
│   │       ├── extractJD.ts      # System prompt + user message builder for JD extraction
│   │       └── generateRubric.ts # System prompt + user message builder for rubric generation
│   ├── parsers/
│   │   ├── index.ts              # Parser dispatcher by MIME type
│   │   ├── pdfParser.ts          # pdf-parse wrapper
│   │   ├── docxParser.ts         # mammoth wrapper
│   │   └── txtParser.ts          # Buffer.toString('utf-8')
│   ├── utils/
│   │   └── asyncPipeline.ts      # Client utilities: job submission, polling, AbortSignal sleep
│   └── validation/
│       ├── index.ts              # Re-exports from schemas
│       └── schemas.ts            # All Zod schemas
└── types/
    ├── index.ts                  # Type re-exports
    ├── rubric.ts                 # Rubric, Signal, AssessmentModality, ModalityGuidance
    ├── signal.ts                 # ExtractedSignal, SignalCategory
    └── jd.ts                     # JobDescription, JobLevel, ParsedFile
```

## Key Design Decisions

### Stateless, No Database
Rubrics are stored in the browser's localStorage. This eliminates database costs and complexity. The tradeoff is that rubrics don't survive browser data clears and aren't shareable across devices.

### In-Memory File Processing
Uploaded files are parsed in-memory and never written to disk or cloud storage. This simplifies the architecture (no S3 bucket needed) and avoids storing potentially sensitive job description data.

### Dual-Pipeline Architecture
The application supports two processing modes controlled by the `NEXT_PUBLIC_USE_ASYNC_PIPELINE` feature flag:

1. **Inline Pipeline (Default)** — Real-time streaming via Next.js API routes with Claude
2. **Async Pipeline** — Queue-based processing via Cloudflare Workers for better scalability

The async proxy routes (`/api/jobs`, `/api/jobs/:jobId`) return 503 if `RUBRIC_PRODUCER_URL` is not set, allowing the caller to detect misconfiguration rather than silently failing.

### Multi-Model Claude Pipeline with Specialized Tasks
The AI work is split into two calls using different Claude models:
1. **Extract** — Identify signals from raw text using Claude Haiku (faster, cost-effective for parsing)
2. **Generate** — Build the rubric from extracted signals using Claude Sonnet (higher quality structured generation)

`output_config: { effort: 'medium' }` is applied only to Sonnet 4.6 calls; Haiku 4.5 returns HTTP 400 if it is set.

### Real-Time Rubric Generation with Server-Sent Events (SSE)
The inline `/api/generate` endpoint streams signals from Claude as newline-delimited JSON objects. Each line is parsed and emitted as an SSE `signal` event; the final event is `done` and carries the rubric ID and metadata. This provides:
- **Real-time feedback** — Users see signals appear as they're created
- **Better perceived performance** — No waiting for the entire rubric to complete
- **Timeout resilience** — 30-second extraction timeout and 90-second generation timeout managed with `AbortController`
- **Graceful error handling** — Stream can be aborted and errors propagated via an `error` event

### Async Pipeline with Polling
The async mode submits jobs to Cloudflare Workers via `/api/jobs` and polls `/api/jobs/:jobId` every 2 seconds for status. Polling is preferred over SSE for async jobs because:
- Jobs complete in 30–45 seconds with ~15–22 status checks
- Each poll reads ~150 bytes from R2 (extremely cheap)
- More reliable through proxies than long-lived connections
- Simple retry and timeout handling

The `runAsyncPipeline` utility accepts an `AbortSignal` for cancellation and an `onStatus` callback so the UI can display queued/running labels from polling.

### Server-Side Document Generation
The export system builds documents server-side using two libraries:
- **PDF**: `@react-pdf/renderer` using `React.createElement` (SSR-compatible, no JSX transform needed)
- **DOCX**: `docx` library with `Document`/`Table`/`Paragraph`/`TextRun` components

Both formats include:
- Weighted signal ranking (sorted descending by weight)
- Color-coded criteria columns (Exceeds / Meets / Below with semantic colors)
- Suggested questions per signal
- Assessment modality indicators
- Metadata header (role, level, signal count, creation date)

Documents are generated server-side and returned as binary downloads with appropriate `Content-Type` and `Content-Disposition` headers.

### Client-Side State Management
The home page drives a linear state machine: `input → loading → streaming → result → error`. Key behaviours:
- An `AbortController` ref is replaced on each new pipeline run and aborted on "Start Over" or unmount
- A `signalsRef` accumulates streaming signals without triggering re-renders; `setRubric` is called with a snapshot after each signal arrives
- The async mode updates a status label string from the `onStatus` callback, surfacing queued/running/attempt-count to the user
- `/rubric/[id]` loads the rubric from localStorage in a `setTimeout(0)` to avoid SSR hydration mismatches and uses `React.use()` to unwrap the params Promise

### Comprehensive Validation Pipeline
All API inputs are validated with Zod schemas before processing:
- `/api/parse` — `FileUploadSchema` (MIME type allowlist, 5 MB size cap)
- `/api/extract` — `TextInputSchema` (100–50,000 characters)
- `/api/generate` — manual checks for `role`, `level`, `signals`
- `/api/export` — presence checks for `rubric` and `format`; format must be `"pdf"` or `"docx"`

Claude's JSON responses are stripped of markdown fences before `JSON.parse`.

### Enhanced User Experience
- **Accessibility**: Skip links, focus management on state transitions, ARIA roles and labels, `role="alert"` on errors, `role="status"` on loading
- **Feedback Integration**: Fixed bottom-left button opens a menu linking to GitHub issue templates (feedback, bug report, feature request, contribution guide)
- **Theme System**: Dark/light toggle with `useSyncExternalStore` for hydration-safe mounting; preference persisted to localStorage
- **Progressive Enhancement**: File drag-and-drop with keyboard fallback (`Enter`/`Space`)
- **Timeout Management**: `EXTRACT_TIMEOUT_MS = 30_000`, `GENERATE_TIMEOUT_MS = 90_000`; Anthropic SDK client timeout is 120 seconds to ensure the server can emit the `done` event before the browser aborts

## Type System

### Core Types

```typescript
// A complete interview rubric
interface Rubric {
  id: string;              // UUID
  role: string;            // e.g., "Senior Backend Engineer"
  level: JobLevel;         // 'entry' | 'mid' | 'senior' | 'staff' | ...
  signals: Signal[];       // Weighted assessment criteria
  createdAt: string;       // ISO 8601
  version: string;         // Schema version
}

// A single assessment criterion within a rubric
interface Signal {
  id: string;              // UUID
  name: string;            // e.g., "System Design"
  description: string;     // What this signal measures
  weight: number;          // 1–10, importance relative to other signals
  criteria: {
    exceeds: string;       // What "exceeds expectations" looks like
    meets: string;         // What "meets expectations" looks like
    below: string;         // What "below expectations" looks like
  };
  suggestedModality: AssessmentModality;
  suggestedQuestions: string[];  // 1–5 interview questions
}

// A signal extracted from the raw job description before rubric generation
interface ExtractedSignal {
  name: string;
  category: SignalCategory;
  importance: 'critical' | 'important' | 'nice_to_have';
  evidence: string;        // Quote or paraphrase from the JD
}

// How to assess a signal
type AssessmentModality =
  | 'pair_programming' | 'system_design' | 'code_review'
  | 'behavioral' | 'take_home' | 'technical_discussion'
  | 'presentation' | 'case_study';

// Seniority levels
type JobLevel =
  | 'entry' | 'mid' | 'senior' | 'staff' | 'principal'
  | 'manager' | 'senior_manager' | 'director' | 'vp' | 'executive';

// Signal categories used during extraction
type SignalCategory =
  | 'technical_skills' | 'domain_knowledge' | 'leadership'
  | 'communication' | 'collaboration' | 'problem_solving'
  | 'culture_fit' | 'experience';

// Async pipeline status
type AsyncJobStatus = 'queued' | 'running' | 'done' | 'failed';
```

## Deployment

The production app runs on **AWS App Runner** (us-east-1) with:
- Source-based deployment from GitHub `main` branch
- Auto-deploy on push
- Node.js 22 runtime
- 1 vCPU, 2 GB RAM instances
- Environment variables: `ANTHROPIC_API_KEY`, `RUBRIC_PRODUCER_URL`, `NEXT_PUBLIC_USE_ASYNC_PIPELINE`

A multi-stage `Dockerfile` is also available for container-based deployments.