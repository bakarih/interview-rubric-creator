import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    // 120 s gives Sonnet 4.6 room to stream a full rubric (8192 max_tokens)
    // and must exceed the client-side generate AbortController timeout (90 s)
    // so the server can emit the done event before the browser aborts.
    client = new Anthropic({ apiKey, timeout: 120_000 });
  }

  return client;
}

export async function generateCompletion(
  systemPrompt: string,
  userMessage: string,
  options?: {
    maxTokens?: number;
    model?: 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001';
  }
): Promise<string> {
  const claude = getClaudeClient();

  const response = await claude.messages.create({
    model: options?.model ?? 'claude-sonnet-4-6',
    max_tokens: options?.maxTokens ?? 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');

  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  return textBlock.text;
}
