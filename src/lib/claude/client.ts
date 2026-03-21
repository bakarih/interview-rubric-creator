import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    client = new Anthropic({ apiKey });
  }

  return client;
}

export async function generateCompletion(
  systemPrompt: string,
  userMessage: string,
  options?: {
    maxTokens?: number;
    model?: 'claude-sonnet-4-20250514' | 'claude-haiku-4-5-20251001';
  }
): Promise<string> {
  const claude = getClaudeClient();

  const response = await claude.messages.create({
    model: options?.model ?? 'claude-sonnet-4-20250514',
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
