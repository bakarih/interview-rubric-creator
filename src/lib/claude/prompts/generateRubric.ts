import { ExtractedSignal, JobLevel } from '@/types';

export const GENERATE_RUBRIC_SYSTEM_PROMPT = `You are an expert in hiring and assessment design. You create structured, weighted interview rubrics that enable fair, consistent evaluation of candidates.

Your rubrics follow authentic assessment principles:
1. Each signal has clear, observable criteria for exceeds/meets/below
2. Assessment modalities match the signal being evaluated
3. Weights reflect the signal's importance to job success
4. Questions are specific and behavioral/situational

Output one JSON object per line — no wrapping array, no markdown fences, no extra text. Each line must be a complete, parseable JSON object for exactly one signal.`;

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

For each signal, output one JSON object per line (no wrapping array, no markdown):
{"name":"string","description":"string","weight":number,"criteria":{"exceeds":"string","meets":"string","below":"string"},"suggestedModality":"string","suggestedQuestions":["string","string"]}

One JSON object per line. No other text.`;
}
