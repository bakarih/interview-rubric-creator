# Capabilities and Limitations

## Application Capabilities

### Input Processing
- **PDF files** — Extracts text from standard PDF documents using pdf-parse
- **DOCX files** — Extracts text from Microsoft Word documents using mammoth
- **TXT files** — Reads plain text files directly
- **Pasted text** — Accepts job descriptions pasted directly into the browser (100–50,000 characters)
- **File size** — Supports uploads up to 5 MB

### AI-Powered Extraction
The application uses **Claude Haiku 4** (`claude-haiku-4-5-20251001`) for extraction and **Claude Sonnet 4** (`claude-sonnet-4-20250514`) for generation to analyze job descriptions and extract:
- **Role title** — The position being hired for
- **Seniority level** — Classified into one of 10 levels: entry, mid, senior, staff, principal, manager, senior_manager, director, vp, executive
- **Department and company** — When identifiable from the text
- **Requirements and responsibilities** — Parsed into structured lists
- **Qualifications** — Separated into required vs. preferred
- **Hiring signals** — 5–10 key competencies the role demands, each categorized (technical_skills, domain_knowledge, leadership, communication, collaboration, problem_solving, culture_fit, experience) and rated by importance (critical, important, nice_to_have)

### Rubric Generation
From the extracted signals, Claude generates a complete interview rubric where each signal includes:
- **Weight (1–10)** — Relative importance for the hiring decision
- **Three-tier criteria** — Specific, observable descriptions for exceeds / meets / below expectations
- **Assessment modality** — The recommended interview format: pair_programming, system_design, code_review, behavioral, take_home, technical_discussion, presentation, or case_study
- **Interview questions** — 1–5 tailored behavioral or situational questions per signal

### Processing Pipelines
The application supports two processing modes:

#### Inline Pipeline (Default)
- **Real-time streaming** — Progressive display of signals as they're generated via Server-Sent Events (SSE)
- **Direct processing** — Runs extraction and generation on the Next.js server
- **Immediate feedback** — Users see signals appear in real-time during generation

#### Async Pipeline (Configurable)
- **Cloudflare Queues + R2** — Offloads processing to background workers with cloud storage
- **Polling-based status** — UI polls for job status every 2 seconds until completion
- **Scalable architecture** — Handles high-concurrency workloads through distributed processing
- **Feature flag controlled** — Enabled via `NEXT_PUBLIC_USE_ASYNC_PIPELINE=true`

### Export
- **PDF** — A4-formatted document with React PDF rendering, color-coded criteria labels (green for exceeds, blue for meets, orange for below), numbered signals sorted by weight, and structured layout with proper typography
- **DOCX** — Word document generated using the docx library with borderless tables, color-coded cell backgrounds (green/blue/orange shading), proper heading hierarchy, and full Google Docs compatibility
- **Fixed filenames** — Exports use standardized names (rubric.pdf, rubric.docx)

### User Experience
- **Dark and light mode** — Toggle with system preference detection, persisted across sessions
- **Drag-and-drop upload** — Visual feedback on drag state with keyboard navigation support
- **Loading states** — Visual feedback during processing with cancel functionality for long-running operations
- **Error handling** — Clear error messages with retry functionality and automatic timeouts (30s for extraction, 90s for generation)
- **URL-based navigation** — Direct links to individual rubrics (`/rubric/[id]`) with shareable URLs and proper state management

### Accessibility (WCAG 2.1 AA)
- Skip-to-content navigation link
- Proper heading hierarchy and semantic landmarks
- ARIA labels on all interactive elements with comprehensive role and state management
- Focus management on state changes with programmatic focus control
- Screen reader compatible tables with proper captions and scope attributes
- Tabbed interface with full ARIA tablist implementation

### Feedback System
- **Built-in feedback widget** — Fixed-position feedback button with expandable menu for sharing feedback, reporting bugs, suggesting features, or contributing code
- **Direct GitHub integration** — Links to repository issue templates for structured feedback with specific templates for each feedback type

---

## AI Model Capabilities

The application uses **Claude Haiku 4** (`claude-haiku-4-5-20251001`) for extraction and **Claude Sonnet 4** (`claude-sonnet-4-20250514`) for generation with a two-step API process.

### What the Model Does Well
- **Structured output** — Reliably produces valid JSON matching the expected schema with automatic markdown fence stripping
- **Signal identification** — Accurately identifies the most important competencies from a job description
- **Criteria writing** — Generates specific, observable criteria that distinguish between performance levels
- **Question generation** — Creates relevant behavioral and situational questions tied to each signal
- **Level detection** — Generally accurate at identifying seniority level from title, requirements, and years of experience
- **Modality matching** — Suggests appropriate assessment formats (e.g., system_design for architecture roles, pair_programming for hands-on coding roles)

### What the Model Handles Reasonably
- **Ambiguous job descriptions** — Produces usable rubrics even from vague or poorly written JDs, though signal quality will reflect input quality
- **Non-technical roles** — Works for product, design, marketing, and other non-engineering roles, though it was primarily designed and tested with technical job descriptions
- **Multi-function roles** — Handles JDs that span multiple disciplines (e.g., "full-stack engineer + team lead")

---

## Limitations

### File Processing
- **PDF layout dependency** — Complex PDF layouts (multi-column, tables, embedded images with text) may result in garbled or incomplete text extraction. Simple, text-based PDFs work best.
- **Scanned PDFs** — PDFs that are scanned images (no embedded text layer) cannot be parsed. OCR is not supported.
- **5 MB limit** — Files larger than 5 MB are rejected. This covers the vast majority of job descriptions but may exclude some PDFs with embedded images.
- **Format support** — Only PDF, DOCX, and TXT are supported. No support for Google Docs links, HTML, RTF, or other formats.

### AI Extraction
- **English only** — The prompts and extraction logic are designed for English-language job descriptions. Non-English JDs may produce partial or inaccurate results.
- **Input quality dependency** — The rubric quality directly reflects the job description quality. Vague JDs produce vague signals. Copy-paste artifacts, formatting noise, or boilerplate-heavy JDs may dilute signal quality.
- **Level misclassification** — Ambiguous titles (e.g., "Engineer" without clear seniority indicators) may be classified at the wrong level. The model uses contextual clues like years of experience and responsibilities, but edge cases exist.
- **Signal count** — The model generates 5–10 signals. Very short JDs may produce fewer meaningful signals, while very detailed JDs may omit some relevant competencies.
- **Domain-specific jargon** — Highly specialized roles (e.g., quantitative finance, biotech research) may have domain terms that the model interprets too generally.

### Rubric Generation
- **Weights are suggestions** — The 1–10 weights reflect the model's interpretation of signal importance. Hiring teams should review and adjust weights based on their priorities.
- **Criteria are starting points** — The exceeds/meets/below criteria are generated guidelines. They should be calibrated to the specific team's expectations and bar.
- **Modality suggestions** — The suggested assessment format (pair_programming, system_design, etc.) is a recommendation. Teams should adapt based on their interview process and constraints.
- **No organizational context** — The model has no knowledge of your company's culture, existing team composition, or internal expectations. Rubrics reflect only what's in the job description.
- **Maximum 15 signals** — Rubrics are capped at 15 signals to keep interviews focused and practical.
- **Token limits** — Rubric generation uses a maximum of 8,192 tokens for generation, which may truncate very detailed rubrics.

### Data and Privacy
- **No persistence** — Rubrics are stored only in the browser's localStorage. Clearing browser data deletes all rubrics permanently. There is no cloud backup or sync.
- **No cross-device access** — Rubrics created on one device/browser are not accessible from another.
- **No authentication** — The application is open access with no user accounts or access controls.
- **API key security** — The Anthropic API key is stored as a server-side environment variable and never exposed to the client.
- **Job descriptions are sent to Anthropic** — The full text of uploaded job descriptions is sent to the Anthropic API for processing. See [Anthropic's data policy](https://www.anthropic.com/policies) for how API inputs are handled.

### Export
- **PDF styling** — The PDF export uses a fixed A4 layout with React PDF rendering. Very long signal names or criteria text may wrap awkwardly.
- **DOCX formatting** — Uses docx library with borderless tables and color-coded cell backgrounds. Complex formatting may not render identically across all Word processors.
- **No Google Docs integration** — DOCX files can be opened in Google Docs, but there is no direct Google Docs API integration.
- **Fixed filename format** — Exported files use generic names (rubric.pdf, rubric.docx) rather than role-specific names.

### Cost
- **API usage** — Each job description processed makes two API calls: one to Claude Haiku 4 for extraction and one to Claude Sonnet 4 for generation. At current pricing, expect roughly $0.01–0.05 per rubric depending on JD length.
- **Hosting** — The application runs on a Next.js architecture with server-side API routes.

### Performance

#### Inline Pipeline
- **Timeouts** — Extraction has a 30-second timeout, generation has a 90-second timeout. Complex job descriptions or API latency may occasionally trigger timeouts.
- **Request cancellation** — Users can cancel in-flight requests, but this aborts the entire pipeline and requires starting over.
- **No retry logic** — Failed requests require manual retry by the user.
- **120-second server timeout** — The Anthropic client has a 120-second timeout that exceeds the client-side timeout to ensure proper stream completion.

#### Async Pipeline
- **Processing time** — Background jobs typically complete in 30-60 seconds depending on job description complexity.
- **Polling overhead** — UI polls every 2 seconds until completion (~15-22 requests per job).
- **90-second timeout** — Jobs that don't complete within 90 seconds are considered failed.
- **No real-time updates** — Status updates only show queued/running states, not individual signal progress.

---

## Planned for v2
- User authentication and saved rubrics
- Team collaboration and shared rubric libraries
- Direct Google Docs integration
- Custom assessment modality definitions
- Rubric templates for common roles
- Rubric editing in the browser before export
- Multi-language support