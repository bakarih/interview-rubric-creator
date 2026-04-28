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
│   ├── layout.tsx                # Root layout with Geist fonts, theme provider
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
│   │   └── WeightBadge.tsx       # Color-coded weight indicator
│   └── upload/
│       ├── FileUpload.tsx        # Drag-and-drop with keyboard support
│       └── TextInput.tsx         # Textarea with character counter
├── lib/
│   ├── claude/
│   │   ├── client.ts             # Anthropic SDK singleton with completion wrapper
│   │   ├── index.ts              # Re-exports from client and prompts
│   │   └── prompts/
│   │       ├── index.ts          # Re-exports from all prompt files
│   │       ├── extractJD.ts      # System prompt for JD extraction
│   │       └── generateRubric.ts # System prompt for rubric generation
│   ├── parsers/
│   │   ├── index.ts              # Parser dispatcher by MIME type
│   │   ├── pdfParser.ts          # pdf-parse wrapper
│   │   ├── docxParser.ts         # mammoth wrapper
│   │   └── txtParser.ts          # Buffer.toString()
│   ├── utils/
│   │   └── asyncPipeline.ts      # Client utilities for async job submission/polling
│   └── validation/
│       ├── index.ts              # Re-exports from schemas
│       └── schemas.ts            # All Zod schemas
└── types/
    ├── index.ts                  # Type exports
    ├── rubric.ts                 # Rubric, Signal, AssessmentModality
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

This flexibility allows deployment in different environments while maintaining the same user experience.

### Multi-Model Claude Pipeline with Specialized Tasks
The AI work is split into two calls using different Claude models:
1. **Extract** — Identify signals from raw text using Claude Haiku (faster, cost-effective for parsing)
2. **Generate** — Build the rubric from extracted signals using Claude Sonnet (higher quality structured generation)

This separation improves both performance and cost-effectiveness while maintaining output quality for complex rubric generation.

### Real-Time Rubric Generation with Server-Sent Events (SSE)
The inline `/api/generate` endpoint uses SSE streaming to progressively deliver signals as they're generated by Claude. This provides:
- **Real-time feedback** — Users see signals appear as they're created
- **Better perceived performance** — No waiting for the entire rubric to complete
- **Timeout resilience** — 90-second client-side timeout covers the entire stream
- **Graceful error handling** — Stream can be aborted and errors propagated

Each signal is streamed as an individual JSON object (one per line), with a final completion event containing rubric metadata.

### Async Pipeline with Polling
The async mode submits jobs to Cloudflare Workers via `/api/jobs` proxy and polls `/api/jobs/:jobId` for status. Polling is preferred over SSE for async jobs because:
- Jobs complete in 30-45 seconds with ~15-22 status checks
- Each poll reads ~150 bytes from R2 (extremely cheap)
- More reliable through proxies than long-lived connections
- Simple retry and timeout handling

### Server-Side Document Generation with React Components
The export system builds documents server-side using React components and native libraries:
- **PDF**: @react-pdf/renderer with `React.createElement` for dynamic component generation (SSR-compatible)
- **DOCX**: docx library with Document/Table/Paragraph components for structured layouts

Both formats include:
- Weighted signal ranking (sorted by importance)
- Color-coded criteria tables (exceeds/meets/below with semantic colors)
- Suggested questions per signal
- Assessment modality indicators
- Professional styling with consistent typography

Documents are generated server-side and returned as binary downloads with appropriate Content-Type headers.

### Client-Side State Management with Progressive Enhancement
The application uses a stateful client-side architecture:
- **Multi-Stage Flow**: Input → Loading → Streaming → Result → Error states with proper focus management
- **Tab-based Input**: Upload/paste interface with ARIA roles and keyboard navigation
- **Dynamic Routing**: `/rubric/[id]` pages load rubrics from localStorage with `React.use()` for params
- **Progressive Streaming UI**: Shows signals appearing in real-time during generation (inline mode)
- **Comprehensive Loading States**: Status message cycling with accessibility announcements
- **Theme System**: Dark/light mode toggle with localStorage persistence using `useSyncExternalStore`

### Comprehensive Validation Pipeline
All API inputs are validated with Zod schemas before processing. Claude's JSON responses are stripped of markdown fences and validated. This catches malformed data early and provides clear error messages.

### Enhanced User Experience
- **Accessibility**: Skip links, focus management, ARIA labels, screen reader support
- **Feedback Integration**: GitHub issue templates for bug reports and feature requests
- **Progressive Enhancement**: File drag-and-drop with fallback click-to-upload
- **Error Handling**: Contextual error messages with retry functionality
- **Timeout Management**: 30-second extraction timeout, 90-second generation timeout with AbortController
- **Responsive Design**: Mobile-optimized interface with proper touch targets

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

// How to assess a signal
type AssessmentModality =
  | 'pair_programming' | 'system_design' | 'code_review'
  | 'behavioral' | 'take_home' | 'technical_discussion'
  | 'presentation' | 'case_study';

// Seniority levels
type JobLevel =
  | 'entry' | 'mid' | 'senior' | 'staff' | 'principal'
  | 'manager' | 'senior_manager' | 'director' | 'vp' | 'executive';

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