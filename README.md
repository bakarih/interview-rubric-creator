# Interview Rubric Creator

An AI-powered web application that transforms job descriptions into structured, weighted interview rubrics. Paste or upload a job description, and the app uses Claude to extract key hiring signals and generate a complete rubric with criteria, suggested questions, and assessment modalities — ready to export as PDF or DOCX.

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          User Interface                                │
│                                                                        │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐ │
│   │ Upload File   │    │  Paste Text  │    │  View & Export Rubric    │ │
│   │ (PDF/DOCX/TXT)│    │              │    │  (PDF / DOCX download)   │ │
│   └──────┬───────┘    └──────┬───────┘    └────────────▲─────────────┘ │
│          │                   │                         │               │
└──────────┼───────────────────┼─────────────────────────┼───────────────┘
           │                   │                         │
           ▼                   ▼                         │
    ┌─────────────┐    ┌─────────────┐                   │
    │  /api/parse  │    │             │                   │
    │  Extract raw │───▶│ /api/extract│                   │
    │  text from   │    │  Claude AI  │                   │
    │  file        │    │  identifies │                   │
    └─────────────┘    │  role, level,│                   │
                       │  signals    │                   │
                       └──────┬──────┘                   │
                              │                          │
                              ▼                          │
                       ┌─────────────┐           ┌──────┴──────┐
                       │/api/generate │           │ /api/export  │
                       │  Claude AI   │──────────▶│  PDF or DOCX │
                       │  creates     │  Rubric   │  generation  │
                       │  weighted    │  stored   └──────────────┘
                       │  rubric      │  client-
                       └─────────────┘  side
```

1. **Input** — Upload a PDF, DOCX, or TXT file, or paste the job description text directly
2. **Parse** — The server extracts raw text from uploaded files
3. **Extract** — Claude analyzes the text and identifies the role, seniority level, and 5–10 key hiring signals
4. **Generate** — Claude builds a complete rubric: each signal gets a weight (1–10), criteria for exceeds/meets/below expectations, a suggested assessment modality, and 2–3 interview questions
5. **Export** — Download the rubric as a formatted PDF or DOCX document

## Getting Started

### Prerequisites

- **Node.js** 20 or later
- **Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com)

### Installation

```bash
# Clone the repository
git clone https://github.com/bakarih/interview-rubric-creator.git
cd interview-rubric-creator

# Install dependencies
npm install

# Set up environment variables
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
| Framework | [Next.js 15](https://nextjs.org/) (App Router) | Full-stack React framework with SSR |
| Language | [TypeScript 5](https://www.typescriptlang.org/) | Type safety across the codebase |
| AI | [Claude Sonnet 4](https://docs.anthropic.com/) via Anthropic SDK | Job description analysis and rubric generation |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first CSS with dark mode support |
| Validation | [Zod 3](https://zod.dev/) | Runtime schema validation for all inputs and outputs |
| PDF Export | [@react-pdf/renderer](https://react-pdf.org/) | PDF document generation with React components |
| DOCX Export | [docx](https://docx.js.org/) | Word document generation |
| File Parsing | [pdf-parse](https://www.npmjs.com/package/pdf-parse), [mammoth](https://www.npmjs.com/package/mammoth) | PDF and DOCX text extraction |
| Testing | [Jest 30](https://jestjs.io/), [Testing Library](https://testing-library.com/), [Playwright](https://playwright.dev/) | Unit, integration, and E2E testing |
| Hosting | [AWS App Runner](https://aws.amazon.com/apprunner/) | Production deployment with auto-deploy from GitHub |

## Features

- **AI-powered extraction** — Automatically identifies role, seniority level, requirements, and key hiring signals from any job description
- **Weighted rubric generation** — Each signal receives a weight (1–10), pass/fail criteria across three levels, a suggested assessment modality, and tailored interview questions
- **Multiple input methods** — Upload PDF, DOCX, or TXT files, or paste text directly
- **PDF and DOCX export** — Download formatted rubrics with color-coded criteria tables
- **Dark/light mode** — Theme toggle with system preference detection and localStorage persistence
- **WCAG 2.1 AA accessible** — Skip navigation, keyboard support, ARIA labels, focus management, reduced motion support
- **100% test coverage** — Enforced across statements, branches, functions, and lines
- **Auto-deploy** — Push to `main` triggers automatic deployment via App Runner

## Architecture

```
src/
├── app/                        # Next.js App Router
│   ├── api/
│   │   ├── parse/              # File text extraction
│   │   ├── extract/            # Claude: JD → structured signals
│   │   ├── generate/           # Claude: signals → weighted rubric
│   │   └── export/             # Rubric → PDF/DOCX binary
│   ├── rubric/[id]/            # Dynamic rubric view page
│   ├── page.tsx                # Home page (upload/paste)
│   └── layout.tsx              # Root layout with theme support
├── components/
│   ├── common/                 # ThemeToggle, LoadingSpinner, ErrorMessage
│   ├── export/                 # ExportButtons (PDF/DOCX)
│   ├── rubric/                 # RubricView, SignalCard, WeightBadge
│   └── upload/                 # FileUpload (drag-drop), TextInput
├── lib/
│   ├── claude/                 # Anthropic client + prompt templates
│   ├── parsers/                # PDF, DOCX, TXT parsers
│   └── validation/             # Zod schemas
└── types/                      # TypeScript interfaces (Rubric, Signal, JD)
```

### Key Design Decisions

- **Stateless API** — No database; rubrics are stored client-side in localStorage. This keeps infrastructure simple and costs low.
- **In-memory file processing** — Uploaded files are parsed in-memory and never persisted to disk or cloud storage.
- **Zod validation everywhere** — All API inputs and Claude responses are validated at runtime, catching malformed data before it causes issues.
- **Standalone Next.js output** — The build produces a self-contained server for containerized deployment.

## API Reference

### POST /api/parse

Extracts text content from uploaded files.

**Request**: `multipart/form-data` with a `file` field
**Response**: `{ text: string }`
**Supported formats**: PDF, DOCX, TXT (max 5MB)

### POST /api/extract

Analyzes job description text and extracts structured information.

**Request**: `{ text: string }`
**Response**: Job description with role, level, and extracted signals
**AI Model**: Claude Sonnet 4

### POST /api/generate

Transforms extracted signals into a complete interview rubric.

**Request**: `{ role: string, level: string, signals: ExtractedSignal[] }`
**Response**: Complete rubric with weighted signals, criteria, and questions
**AI Model**: Claude Sonnet 4

### POST /api/export

Exports rubric as PDF or DOCX file.

**Request**: `{ rubric: Rubric, format: 'pdf' | 'docx' }`
**Response**: Binary file download
**Libraries**: @react-pdf/renderer, docx

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Your Anthropic API key |
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

A `Dockerfile` is also provided for alternative container-based deployments.

## Contributing

We welcome contributions from everyone — no coding required. See [CONTRIBUTING.md](CONTRIBUTING.md) for all the ways you can help, from sharing feedback to submitting code.

## License

Private — not licensed for redistribution.