# API Reference

All endpoints accept and return JSON unless otherwise noted. Errors return `{ error: string }` with an appropriate HTTP status code.

---

## POST /api/parse

Extracts raw text from an uploaded file.

**Content-Type:** `multipart/form-data`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | PDF, DOCX, or TXT file (max 5 MB) |

**Response (200):**

```json
{
  "text": "Senior Software Engineer\n\nAbout the role..."
}
```

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | No file provided, invalid file type, or exceeds 5 MB |
| 500 | File parsing failure (e.g., corrupt PDF, empty file) |

---

## POST /api/extract

Sends raw text to Claude (Haiku model) to extract a structured job description with hiring signals.

**Content-Type:** `application/json`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Job description text (100–50,000 characters) |

**Response (200):**

```json
{
  "rawText": "...",
  "role": "Senior Backend Engineer",
  "level": "senior",
  "department": "Engineering",
  "company": "Acme Corp",
  "requirements": [
    "5+ years of backend development experience",
    "Proficiency in Go or Python"
  ],
  "responsibilities": [
    "Design and build scalable APIs",
    "Mentor junior engineers"
  ],
  "qualifications": {
    "required": ["BS in Computer Science or equivalent"],
    "preferred": ["Experience with distributed systems"]
  },
  "signals": [
    {
      "name": "API Design",
      "category": "technical_skills",
      "importance": "critical",
      "evidence": "Design and build scalable APIs serving 10M+ requests/day"
    }
  ]
}
```

**Signal Categories:** `technical_skills`, `domain_knowledge`, `leadership`, `communication`, `collaboration`, `problem_solving`, `culture_fit`, `experience`

**Importance Levels:** `critical`, `important`, `nice_to_have`

**Job Levels:** `entry`, `mid`, `senior`, `staff`, `principal`, `manager`, `senior_manager`, `director`, `vp`, `executive`

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Invalid input (text too short, too long, or missing) |
| 500 | Claude API error or response parsing failure |

---

## POST /api/generate

Takes extracted signals and streams a complete weighted interview rubric using Claude (Sonnet model) via Server-Sent Events (SSE).

**Content-Type:** `application/json`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | Yes | Role title |
| `level` | JobLevel | Yes | Seniority level |
| `signals` | ExtractedSignal[] | Yes | Array of extracted signals (non-empty) |

**Response (200):**

Returns a Server-Sent Events stream. Each event contains JSON data.

**Signal Event** — emitted once per signal as it is generated:
```json
{
  "type": "signal",
  "signal": {
    "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "name": "API Design",
    "description": "Ability to design clean, scalable, and well-documented APIs",
    "weight": 9,
    "criteria": {
      "exceeds": "Designs APIs that handle edge cases elegantly, include versioning strategy, and come with comprehensive documentation",
      "meets": "Designs functional APIs with clear endpoints, proper error handling, and basic documentation",
      "below": "APIs lack consistency, miss common edge cases, or have unclear contracts"
    },
    "suggestedModality": "system_design",
    "suggestedQuestions": [
      "Walk me through how you would design an API for a payment processing system. What tradeoffs would you consider?",
      "Tell me about a time you had to evolve an API without breaking existing consumers."
    ]
  }
}
```

**Completion Event** — emitted once after all signals:
```json
{
  "type": "done",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "role": "Senior Backend Engineer",
  "level": "senior",
  "createdAt": "2026-03-21T04:00:00.000Z",
  "version": "1.0.0"
}
```

**Error Event:**
```json
{
  "type": "error",
  "message": "Failed to generate rubric"
}
```

**Response Headers:**
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

**Assessment Modalities:** `pair_programming`, `system_design`, `code_review`, `behavioral`, `take_home`, `technical_discussion`, `presentation`, `case_study`

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Missing required fields: role, level, or signals |
| 500 | Claude API error or stream failure |

---

## POST /api/jobs

Proxies a job description submission to the Cloudflare producer Worker for async rubric generation. Requires `RUBRIC_PRODUCER_URL` to be configured.

**Content-Type:** `application/json`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Job description text (non-empty) |

**Response (200):**

```json
{
  "jobId": "abc123",
  "status": "queued"
}
```

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Invalid JSON body or missing/empty `text` field |
| 502 | Failed to reach producer Worker |
| 503 | Async pipeline not configured (missing `RUBRIC_PRODUCER_URL`) |

---

## GET /api/jobs/:jobId

Proxies a status poll to the Cloudflare producer Worker for a previously submitted job. `jobId` must be alphanumeric, hyphens, or underscores.

**Response (200):**

```json
{
  "jobId": "abc123",
  "status": "done",
  "createdAt": "2026-03-21T04:00:00.000Z",
  "updatedAt": "2026-03-21T04:01:30.000Z",
  "attempts": 1,
  "rubric": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "role": "Senior Backend Engineer",
    "level": "senior",
    "signals": ["..."],
    "createdAt": "2026-03-21T04:00:00.000Z",
    "version": "1.0.0"
  }
}
```

**Job Status Values:**

| Status | Description |
|--------|-------------|
| `queued` | Job submitted, not yet started |
| `running` | Pipeline is actively processing |
| `done` | Completed successfully — response includes `rubric` field |
| `failed` | Processing failed — response includes `error` field |

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Invalid `jobId` format |
| 404 | Job not found |
| 502 | Failed to reach producer Worker |
| 503 | Async pipeline not configured (missing `RUBRIC_PRODUCER_URL`) |

---

## POST /api/export

Exports a rubric as a downloadable PDF or DOCX file. Signals are sorted by weight (descending) in the exported document.

**Content-Type:** `application/json`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rubric` | Rubric | Yes | Complete rubric object |
| `format` | string | Yes | `"pdf"` or `"docx"` |

**Response (200):**

Binary file download with appropriate headers:
- PDF: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="rubric.pdf"`
- DOCX: `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `Content-Disposition: attachment; filename="rubric.docx"`

Both formats include: role title, level, signal count, creation date, and for each signal — name, weight, suggested modality, description, exceeds/meets/below criteria, and suggested questions.

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Missing `rubric` or `format`, or `format` is not `"pdf"` or `"docx"` |
| 500 | Document generation failure |

---

## GET /api/version

Returns deployment metadata. Reads from `NEXT_PUBLIC_COMMIT_SHA` and `NEXT_PUBLIC_DEPLOYED_AT` environment variables; falls back to `"unknown"` if unset.

**Response (200):**

```json
{
  "commit": "abc123def456",
  "deployedAt": "2026-03-21T04:00:00.000Z"
}
```