# Architecture

## Overview

Interview Rubric Creator is a Next.js application that uses Claude AI (claude-sonnet-4-20250514) to transform job descriptions into structured interview rubrics. It runs as a stateless server — no database, no cloud storage — with all rubric data stored client-side in localStorage.

## Data Flow

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
└──────────┘               │ Strips markdown fences                (claude-sonnet-4-20250514)
                            │ Parses JSON response
                            │ Returns JobDescription + signals
                            ▼
                       POST /api/generate
                        │ Validates role, level, signals
                        │ Sends to Claude ───────────────────▶ Anthropic API
                        │ Strips markdown fences               (claude-sonnet-4-20250514)
                        │ Parses JSON, assigns UUIDs
                        │ Returns complete Rubric
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

## Module Structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── parse/route.ts        # File → raw text (pdf-parse/mammoth)
│   │   ├── extract/route.ts      # Text → JobDescription (Claude)
│   │   ├── generate/route.ts     # Signals → Rubric (Claude)
│   │   └── export/route.ts       # Rubric → PDF/DOCX binary
│   ├── rubric/[id]/page.tsx      # Dynamic rubric view
│   ├── page.tsx                  # Home page (upload/paste tabs)
│   ├── layout.tsx                # Root layout, theme provider
│   └── globals.css               # Tailwind + accessibility styles
├── components/
│   ├── common/
│   │   ├── ThemeToggle.tsx       # Dark/light mode with localStorage
│   │   ├── LoadingSpinner.tsx    # Animated loading with status messages
│   │   ├── ErrorMessage.tsx      # Error display with retry
│   │   └── FeedbackButton.tsx    # GitHub feedback menu
│   ├── export/
│   │   └── ExportButtons.tsx     # PDF/DOCX download triggers
│   ├── rubric/
│   │   ├── RubricView.tsx        # Full rubric display
│   │   ├── SignalCard.tsx        # Individual signal with criteria
│   │   └── WeightBadge.tsx       # Visual weight indicator
│   └── upload/
│       ├── FileUpload.tsx        # Drag-and-drop file input
│       └── TextInput.tsx         # Textarea with character counter
├── lib/
│   ├── claude/
│   │   ├── client.ts             # Anthropic SDK wrapper (singleton)
│   │   └── prompts/
│   │       ├── extractJD.ts      # System prompt for JD extraction
│   │       └── generateRubric.ts # System prompt for rubric generation
│   ├── parsers/
│   │   ├── pdfParser.ts          # pdf-parse wrapper
│   │   ├── docxParser.ts         # mammoth wrapper
│   │   └── txtParser.ts          # Buffer.toString()
│   └── validation/
│       └── schemas.ts            # All Zod schemas
└── types/
    ├── rubric.ts                 # Rubric, Signal, AssessmentModality
    ├── signal.ts                 # ExtractedSignal, SignalCategory
    └── jd.ts                     # JobDescription, JobLevel, ParsedFile
```

## Key Design Decisions

### Stateless, No Database
Rubrics are stored in the browser's localStorage. This eliminates database costs and complexity. The tradeoff is that rubrics don't survive browser data clears and aren't shareable across devices.

### In-Memory File Processing
Uploaded files are parsed in-memory and never written to disk or cloud storage. This simplifies the architecture (no S3 bucket needed) and avoids storing potentially sensitive job description data.

### Two-Step Claude Pipeline
The AI work is split into two calls rather than one:
1. **Extract** — Identify signals from the raw text (smaller, focused task)
2. **Generate** — Build the rubric from extracted signals (structured generation)

This separation improves reliability. Each call has a narrower scope, making Claude's output more consistent and easier to validate.

### React-Based Export System with Native Document Rendering
The export system builds documents using React components and native rendering libraries:
- **PDF**: @react-pdf/renderer with React.createElement for dynamic component generation and professional styling
- **DOCX**: docx library with structured tables, colored headers, and semantic shading

Both formats include:
- Weighted signal ranking (sorted by importance)
- Color-coded criteria tables (exceeds/meets/below with semantic colors)
- Suggested questions per signal  
- Assessment modality indicators
- Professional styling with consistent spacing and typography

### Geist Font System
The application uses Next.js Geist fonts (sans and mono variants) for consistent typography across all components and exported documents.

### Comprehensive Validation Pipeline
All API inputs are validated with Zod schemas before processing. Claude's JSON responses are stripped of markdown fences and validated. This catches malformed data early and provides clear error messages.

### Enhanced User Experience
- **Multi-Stage Loading**: Contextual progress indicators with cycling status messages
- **Feedback System**: FeedbackButton component provides GitHub issue templates for feedback, bug reports, and feature requests
- **Accessibility**: Skip links, focus management, ARIA labels, and semantic HTML throughout
- **Dark Mode**: Theme toggle with localStorage persistence and system preference detection
- **Client-Side Routing**: Dynamic rubric URLs with localStorage integration for sharing and bookmarking

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
  suggestedQuestions: string[];  // 2–5 interview questions
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
```

## Testing Strategy

| Layer | Framework | What's Tested |
|-------|-----------|---------------|
| Unit | Jest + ts-jest | Zod schemas, parsers, Claude prompts, client |
| Integration | Jest | API route handlers with mocked Claude responses |
| E2E | Playwright | Full user flow: upload → extract → generate → export |

Coverage is enforced at **100%** for statements, branches, functions, and lines.

## Deployment

The production app runs on **AWS App Runner** (us-east-1) with:
- Source-based deployment from GitHub `main` branch
- Auto-deploy on push
- Node.js 22 runtime
- 1 vCPU, 2 GB RAM instances
- Environment variable: `ANTHROPIC_API_KEY`

A multi-stage `Dockerfile` is also available for container-based deployments.