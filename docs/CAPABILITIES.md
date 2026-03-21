# Capabilities and Limitations

## Application Capabilities

### Input Processing
- **PDF files** — Extracts text from standard PDF documents using pdf-parse
- **DOCX files** — Extracts text from Microsoft Word documents using mammoth
- **TXT files** — Reads plain text files directly
- **Pasted text** — Accepts job descriptions pasted directly into the browser (100–50,000 characters)
- **File size** — Supports uploads up to 5 MB

### AI-Powered Extraction
The application uses Claude Sonnet 4 to analyze job descriptions and extract:
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
- **Interview questions** — 2–3 tailored behavioral or situational questions (capped at 5 per signal)

### Export
- **PDF** — Formatted document with color-coded criteria tables (green for exceeds, blue for meets, orange for below), sorted by signal weight with proper accessibility support
- **DOCX** — Structured Word document with headings, color-coded tables, and formatting, compatible with Google Docs

### User Experience
- **Dark and light mode** — Toggle with system preference detection, persisted across sessions
- **Drag-and-drop upload** — Visual feedback on drag state with keyboard navigation support
- **Keyboard navigation** — Full keyboard support throughout the interface including skip-to-content navigation
- **Loading states** — Rotating status messages during AI processing ("Parsing document...", "Extracting signals...", "Generating rubric...")
- **Error handling** — Clear error messages with retry functionality
- **URL-based navigation** — Direct links to individual rubrics (`/rubric/[id]`) with shareable URLs

### Accessibility (WCAG 2.1 AA)
- Skip-to-content navigation link
- Proper heading hierarchy and semantic landmarks
- ARIA labels on all interactive elements
- Focus management on state changes
- Screen reader compatible tables and form elements
- Tabbed interface with proper ARIA attributes

### Feedback System
- **Built-in feedback widget** — Fixed-position feedback button with menu options for sharing feedback, reporting bugs, suggesting features, or contributing code
- **Direct GitHub integration** — Links to repository issue templates for structured feedback

---

## AI Model Capabilities

The application uses **Claude Sonnet 4** (`claude-sonnet-4-20250514`) for both extraction and generation.

### What the Model Does Well
- **Structured output** — Reliably produces valid JSON matching the expected schema
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
- **Fixed token limits** — Rubric generation uses a maximum of 8,192 tokens, which may truncate very detailed rubrics.

### Data and Privacy
- **No persistence** — Rubrics are stored only in the browser's localStorage. Clearing browser data deletes all rubrics permanently. There is no cloud backup or sync.
- **No cross-device access** — Rubrics created on one device/browser are not accessible from another.
- **No authentication** — The application is open access with no user accounts or access controls.
- **API key security** — The Anthropic API key is stored as a server-side environment variable and never exposed to the client.
- **Job descriptions are sent to Anthropic** — The full text of uploaded job descriptions is sent to the Anthropic API for processing. See [Anthropic's data policy](https://www.anthropic.com/policies) for how API inputs are handled.

### Export
- **PDF styling** — The PDF export uses a fixed layout optimized for A4 format. Very long signal names or criteria text may wrap awkwardly.
- **No Google Docs integration** — DOCX files can be opened in Google Docs, but there is no direct Google Docs API integration.
- **No edit-and-re-export** — Rubrics cannot be edited in the browser and re-exported. To make changes, you would need to edit the exported document directly.
- **Fixed filename format** — Exported files use generic names (rubric.pdf, rubric.docx) rather than role-specific names.

### Cost
- **API usage** — Each job description processed makes two API calls to Claude (extract + generate). At current Sonnet 4 pricing, expect roughly $0.01–0.05 per rubric depending on JD length.
- **Hosting** — The application runs on a Next.js architecture with server-side API routes.

---

## Planned for v2
- User authentication and saved rubrics
- Team collaboration and shared rubric libraries
- Direct Google Docs integration
- Custom assessment modality definitions
- Rubric templates for common roles
- Rubric editing in the browser before export
- Multi-language support