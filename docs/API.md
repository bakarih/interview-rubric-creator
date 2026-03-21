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
| 400 | No file provided, unsupported file type, or file exceeds 5 MB |
| 500 | File parsing failure (e.g., corrupt PDF) |

---

## POST /api/extract

Sends raw text to Claude AI to extract a structured job description with hiring signals.

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
| 400 | Text too short (< 100 chars), too long (> 50,000 chars), or missing |
| 500 | Claude API error or response parsing failure |

---

## POST /api/generate

Takes extracted signals and generates a complete weighted interview rubric using Claude AI.

**Content-Type:** `application/json`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | Yes | Role title |
| `level` | JobLevel | Yes | Seniority level |
| `signals` | ExtractedSignal[] | Yes | Array of extracted signals (non-empty) |

**Response (200):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "role": "Senior Backend Engineer",
  "level": "senior",
  "signals": [
    {
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
  ],
  "createdAt": "2026-03-21T04:00:00.000Z",
  "version": "1.0.0"
}
```

**Assessment Modalities:** `pair_programming`, `system_design`, `code_review`, `behavioral`, `take_home`, `technical_discussion`, `presentation`, `case_study`

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Missing `role`, `level`, or `signals` |
| 500 | Claude API error or response parsing failure |

---

## POST /api/export

Exports a rubric as a downloadable PDF or DOCX file.

**Content-Type:** `application/json`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rubric` | Rubric | Yes | Complete rubric object |
| `format` | string | Yes | `"pdf"` or `"docx"` |

**Response (200):**

Binary file download with appropriate headers:
- PDF: `Content-Type: application/pdf`
- DOCX: `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`

**Errors:**

| Status | Reason |
|--------|--------|
| 400 | Missing rubric, missing format, or invalid format value |
| 500 | Document generation failure |
