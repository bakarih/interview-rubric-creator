import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { generateCompletion } from '@/lib/claude';
import { GENERATE_RUBRIC_SYSTEM_PROMPT, buildGenerateRubricUserMessage } from '@/lib/claude/prompts';
import { Rubric } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { role, level, signals } = body;

    if (!role || !level || !signals?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: role, level, signals' },
        { status: 400 }
      );
    }

    // Generate rubric using Claude
    const response = await generateCompletion(
      GENERATE_RUBRIC_SYSTEM_PROMPT,
      buildGenerateRubricUserMessage(role, level, signals),
      { maxTokens: 8192 }
    );

    // Strip markdown fences if present
    const cleaned = response.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    const generated = JSON.parse(cleaned);

    // Build complete rubric
    const rubric: Rubric = {
      id: uuidv4(),
      role,
      level,
      signals: generated.signals.map((s: Record<string, unknown>) => ({
        ...s,
        id: uuidv4(),
      })),
      createdAt: new Date().toISOString(),
      version: '1.0.0',
    };

    return NextResponse.json(rubric);
  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json(
      { error: 'Failed to generate rubric' },
      { status: 500 }
    );
  }
}
