import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getClaudeClient } from '@/lib/claude/client';
import { GENERATE_RUBRIC_SYSTEM_PROMPT, buildGenerateRubricUserMessage } from '@/lib/claude/prompts';
import { Signal, JobLevel, ExtractedSignal } from '@/types';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { role, level, signals } = body as {
    role?: string;
    level?: string;
    signals?: unknown[];
  };

  if (!role || !level || !signals?.length) {
    return NextResponse.json(
      { error: 'Missing required fields: role, level, signals' },
      { status: 400 }
    );
  }

  const rubricId = uuidv4();
  const createdAt = new Date().toISOString();
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      function emit(data: object): void {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      function tryEmitSignalLine(line: string): void {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('```')) return;
        try {
          const parsed = JSON.parse(trimmed) as Omit<Signal, 'id'>;
          const signal: Signal = { id: uuidv4(), ...parsed };
          emit({ type: 'signal', signal });
        } catch {
          // Skip lines that aren't valid signal JSON
        }
      }

      try {
        const claude = getClaudeClient();
        const messageStream = claude.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: GENERATE_RUBRIC_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: buildGenerateRubricUserMessage(role, level as JobLevel, signals as ExtractedSignal[]),
            },
          ],
        });

        let lineBuffer = '';

        for await (const chunk of messageStream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            lineBuffer += chunk.delta.text;
            const newlineIdx = lineBuffer.lastIndexOf('\n');
            if (newlineIdx !== -1) {
              const completeLines = lineBuffer.slice(0, newlineIdx).split('\n');
              lineBuffer = lineBuffer.slice(newlineIdx + 1);
              for (const line of completeLines) {
                tryEmitSignalLine(line);
              }
            }
          }
        }

        // Flush any content that arrived without a trailing newline
        if (lineBuffer) {
          tryEmitSignalLine(lineBuffer);
        }

        emit({ type: 'done', id: rubricId, role, level, createdAt, version: '1.0.0' });
      } catch (error) {
        console.error('Generate stream error:', error);
        emit({ type: 'error', message: 'Failed to generate rubric' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
