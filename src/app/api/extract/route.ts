import { NextRequest, NextResponse } from 'next/server';
import { generateCompletion } from '@/lib/claude';
import { EXTRACT_JD_SYSTEM_PROMPT, buildExtractJDUserMessage } from '@/lib/claude/prompts';
import { TextInputSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const inputValidation = TextInputSchema.safeParse(body);
    if (!inputValidation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: inputValidation.error.flatten() },
        { status: 400 }
      );
    }

    const { text } = inputValidation.data;

    // Extract using Claude
    const response = await generateCompletion(
      EXTRACT_JD_SYSTEM_PROMPT,
      buildExtractJDUserMessage(text)
    );

    // Parse and validate response (strip markdown fences if present)
    const cleaned = response.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    const extracted = JSON.parse(cleaned);
    extracted.rawText = text;

    return NextResponse.json(extracted);
  } catch (error) {
    console.error('Extract error:', error);
    return NextResponse.json(
      { error: 'Failed to extract job description' },
      { status: 500 }
    );
  }
}
