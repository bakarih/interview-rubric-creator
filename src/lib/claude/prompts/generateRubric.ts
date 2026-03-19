import { ExtractedSignal, JobLevel } from '@/types';

export const GENERATE_RUBRIC_SYSTEM_PROMPT = `You are an expert in hiring and assessment design. You create structured, weighted interview rubrics that enable fair, consistent evaluation of candidates.

Your rubrics follow authentic assessment principles:
1. Each signal has clear, observable criteria for exceeds/meets/below
2. Assessment modalities match the signal being evaluated
3. Weights reflect the signal's importance to job success
4. Questions are specific and behavioral/situational

You must respond with valid JSON only. No additional text.`;

export function buildGenerateRubricUserMessage(
  role: string,
  level: JobLevel,
  signals: ExtractedSignal[]
): string {
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
      "id": "uuid",
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
