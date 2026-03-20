# Architecture

## Overview
Interview Rubric Creator is a Next.js 14 application that uses Claude AI to transform job descriptions into structured interview rubrics.

## Flow
1. **Input** — User uploads a file (PDF/DOCX/TXT) or pastes text
2. **Parse** — `/api/parse` extracts raw text from uploaded files
3. **Extract** — `/api/extract` sends text to Claude to identify signals, role, level
4. **Generate** — `/api/generate` sends signals to Claude to create the full rubric
5. **Export** — `/api/export` converts rubric to PDF or DOCX

## Module Structure
- `src/app/` — Next.js App Router pages and API routes
- `src/lib/parsers/` — File format parsers (PDF, DOCX, TXT)
- `src/lib/claude/` — Claude AI client and prompt templates
- `src/lib/validation/` — Zod schemas for input/output validation
- `src/types/` — TypeScript interfaces
- `src/components/` — React UI components

## Key Design Decisions
- **Stateless API** — No database; rubrics stored client-side in localStorage
- **Claude Opus 4.6** — Used for both extraction and generation steps
- **Zod validation** — All inputs validated before hitting Claude
- **100% test coverage** — Unit + integration tests for all non-UI code
