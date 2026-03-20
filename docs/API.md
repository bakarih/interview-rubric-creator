# API Reference

## POST /api/parse
Extracts text from uploaded file.

**Request:** `multipart/form-data` with `file` field (PDF, DOCX, or TXT, max 5MB)

**Response:** `{ text: string }`

**Errors:** 400 (no file, invalid type, too large), 500 (parse failure)

---

## POST /api/extract
Extracts structured job description data using Claude AI.

**Request:** `{ text: string }` (100–50,000 chars)

**Response:** `JobDescription` object with `signals` array

**Errors:** 400 (text too short/long), 500 (Claude error)

---

## POST /api/generate
Generates a weighted interview rubric from extracted signals.

**Request:** `{ role: string, level: JobLevel, signals: ExtractedSignal[] }`

**Response:** `Rubric` object

**Errors:** 400 (missing fields), 500 (Claude error)

---

## POST /api/export
Exports a rubric as PDF or DOCX.

**Request:** `{ rubric: Rubric, format: 'pdf' | 'docx' }`

**Response:** Binary file download

**Errors:** 400 (missing fields, invalid format), 500 (export failure)
