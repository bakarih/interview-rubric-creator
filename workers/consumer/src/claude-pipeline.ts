/**
 * Claude pipeline for the consumer Worker.
 *
 * Ported from src/lib/claude/ in the Next.js app. Two key changes vs. the original:
 *
 *   1. We use raw fetch() against the Anthropic API instead of @anthropic-ai/sdk.
 *      Workers don't bundle Node built-ins, and the SDK pulls in a chunky
 *      dependency tree. Raw fetch keeps the bundle small and cold-starts fast.
 *
 *   2. We don't import from src/lib/* — the prompts are inlined here so the
 *      Worker is self-contained. If you change a prompt in the Next.js app,
 *      you also have to change it here. That coupling is intentional: the
 *      Worker is a separate deployable artifact and shouldn't share code with
 *      the Next.js bundle at runtime.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const EXTRACT_MODEL = 'claude-haiku-4-5-20251001';
const GENERATE_MODEL = 'claude-sonnet-4-20250514';

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

/**
 * Single Claude API call. Returns the text body of the first text block.
 * Throws if the API returns a non-2xx status or no text block is present.
 */
async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  options: { model: string; maxTokens: number }
): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Claude API error ${response.status}: ${errBody.slice(0, 500)}`);
  }

  const data = (await response.json()) as AnthropicMessageResponse;
  const textBlock = data.content.find((b) => b.type === 'text' && typeof b.text === 'string');

  if (!textBlock?.text) {
    throw new Error('Claude returned no text block');
  }

  return textBlock.text;
}

/**
 * Strips ```json ... ``` fences from Claude's response if present.
 * Some prompts ask for JSON-only but the model sometimes wraps it anyway.
 */
function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
}

// --- Stage 1: Extract structured signals from JD text ---

const EXTRACT_JD_SYSTEM_PROMPT = `You are an expert HR analyst and technical recruiter. Your task is to analyze job descriptions and extract structured information.

You must respond with valid JSON only. No additional text or explanation.

Extract the following from the job description:
1. role: The job title
2. level: One of: entry, mid, senior, staff, principal, manager, senior_manager, director, vp, executive
3. department: The department or team (if mentioned)
4. company: The company name (if mentioned)
5. requirements: Array of key requirements
6. responsibilities: Array of main responsibilities
7. qualifications: Object with "required" and "preferred" arrays
8. signals: Array of key signals to assess, each with:
   - name: Signal name (e.g., "React proficiency", "System design")
   - category: One of: technical_skills, domain_knowledge, leadership, communication, collaboration, problem_solving, culture_fit, experience
   - importance: One of: critical, important, nice_to_have
   - evidence: Direct quote or paraphrase from JD supporting this signal

Be thorough but focused. Identify 5-10 key signals that would differentiate candidates.`;

function buildExtractUserMessage(jdText: string): string {
  return `Analyze this job description and extract structured information:

---
${jdText}
---

Respond with valid JSON matching this structure:
{
  "role": "string",
  "level": "string",
  "department": "string or null",
  "company": "string or null",
  "requirements": ["string"],
  "responsibilities": ["string"],
  "qualifications": {
    "required": ["string"],
    "preferred": ["string"]
  },
  "signals": [
    {
      "name": "string",
      "category": "string",
      "importance": "string",
      "evidence": "string"
    }
  ]
}`;
}

interface ExtractedSignal {
  name: string;
  category: string;
  importance: string;
  evidence: string;
}

interface ExtractionResult {
  role: string;
  level: string;
  signals: ExtractedSignal[];
}

export async function extractSignals(jdText: string, apiKey: string): Promise<ExtractionResult> {
  const text = await callClaude(apiKey, EXTRACT_JD_SYSTEM_PROMPT, buildExtractUserMessage(jdText), {
    model: EXTRACT_MODEL,
    maxTokens: 4096,
  });

  const cleaned = stripJsonFences(text);
  const parsed = JSON.parse(cleaned) as ExtractionResult;

  if (!parsed.role || !parsed.level || !Array.isArray(parsed.signals) || parsed.signals.length === 0) {
    throw new Error('Extraction returned invalid shape (missing role/level/signals)');
  }

  return parsed;
}

// --- Stage 2: Generate weighted rubric from extracted signals ---

const GENERATE_RUBRIC_SYSTEM_PROMPT = `You are an expert in hiring and assessment design. You create structured, weighted interview rubrics that enable fair, consistent evaluation of candidates.

Your rubrics follow authentic assessment principles:
1. Each signal has clear, observable criteria for exceeds/meets/below
2. Assessment modalities match the signal being evaluated
3. Weights reflect the signal's importance to job success
4. Questions are specific and behavioral/situational

You must respond with valid JSON only. No additional text.`;

function buildGenerateUserMessage(role: string, level: string, signals: ExtractedSignal[]): string {
  const signalsList = signals
    .map((s, i) => `${i + 1}. ${s.name} (${s.category}, ${s.importance}): "${s.evidence}"`)
    .join('\n');

  return `Create an interview rubric for this role:

Role: ${role}
Level: ${level}

Signals to assess:
${signalsList}

For each signal, provide:
1. A weight (1-10) based on importance
2. Clear criteria for "exceeds", "meets", and "below" expectations
3. A suggested assessment modality (one of: pair_programming, system_design, code_review, behavioral, take_home, technical_discussion, presentation, case_study)
4. 2-3 suggested interview questions

Respond with valid JSON:
{
  "signals": [
    {
      "name": "string",
      "description": "string",
      "weight": number,
      "criteria": {
        "exceeds": "string",
        "meets": "string",
        "below": "string"
      },
      "suggestedModality": "string",
      "suggestedQuestions": ["string"]
    }
  ]
}`;
}

interface GeneratedSignal {
  name: string;
  description?: string;
  weight: number;
  criteria?: { exceeds?: string; meets?: string; below?: string };
  suggestedModality?: string;
  suggestedQuestions?: string[];
}

interface GenerationResult {
  signals: GeneratedSignal[];
}

export async function generateRubricSignals(
  role: string,
  level: string,
  signals: ExtractedSignal[],
  apiKey: string
): Promise<GenerationResult> {
  const text = await callClaude(
    apiKey,
    GENERATE_RUBRIC_SYSTEM_PROMPT,
    buildGenerateUserMessage(role, level, signals),
    { model: GENERATE_MODEL, maxTokens: 8192 }
  );

  const cleaned = stripJsonFences(text);
  const parsed = JSON.parse(cleaned) as GenerationResult;

  if (!Array.isArray(parsed.signals) || parsed.signals.length === 0) {
    throw new Error('Generation returned invalid shape (missing signals array)');
  }

  return parsed;
}
