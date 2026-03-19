// We need to reset the module registry between tests that modify env variables,
// because client.ts has a module-level singleton.

describe('getClaudeClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    jest.mock('@anthropic-ai/sdk', () => ({
      __esModule: true,
      default: jest.fn(),
    }));

    const { getClaudeClient } = await import('@/lib/claude/client');
    expect(() => getClaudeClient()).toThrow('ANTHROPIC_API_KEY environment variable is not set');
  });

  it('creates and returns an Anthropic client when API key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key';

    const mockInstance = { messages: { create: jest.fn() } };
    const MockAnthropic = jest.fn().mockImplementation(() => mockInstance);

    jest.mock('@anthropic-ai/sdk', () => ({
      __esModule: true,
      default: MockAnthropic,
    }));

    const { getClaudeClient } = await import('@/lib/claude/client');
    const result = getClaudeClient();

    expect(MockAnthropic).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
    expect(result).toBe(mockInstance);
  });

  it('returns the same singleton on subsequent calls', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-api-key';

    const mockInstance = { messages: { create: jest.fn() } };
    const MockAnthropic = jest.fn().mockImplementation(() => mockInstance);

    jest.mock('@anthropic-ai/sdk', () => ({
      __esModule: true,
      default: MockAnthropic,
    }));

    const { getClaudeClient } = await import('@/lib/claude/client');
    const first = getClaudeClient();
    const second = getClaudeClient();

    expect(first).toBe(second);
    // Constructor called only once
    expect(MockAnthropic).toHaveBeenCalledTimes(1);
  });
});

describe('generateCompletion', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns text from the first text block in the response', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Hello from Claude' }],
    });

    jest.mock('@anthropic-ai/sdk', () => ({
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
      })),
    }));

    const { generateCompletion } = await import('@/lib/claude/client');
    const result = await generateCompletion('system prompt', 'user message');

    expect(result).toBe('Hello from Claude');
  });

  it('calls the API with the correct model and parameters', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'response' }],
    });

    jest.mock('@anthropic-ai/sdk', () => ({
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
      })),
    }));

    const { generateCompletion } = await import('@/lib/claude/client');
    await generateCompletion('sys', 'user', { maxTokens: 1000 });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-6',
        max_tokens: 1000,
        system: 'sys',
        messages: [{ role: 'user', content: 'user' }],
      })
    );
  });

  it('uses default max_tokens of 4096 when none is provided', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'response' }],
    });

    jest.mock('@anthropic-ai/sdk', () => ({
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
      })),
    }));

    const { generateCompletion } = await import('@/lib/claude/client');
    await generateCompletion('sys', 'user');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4096 })
    );
  });

  it('throws when no text block is present in the response', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'image', source: {} }],
    });

    jest.mock('@anthropic-ai/sdk', () => ({
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
      })),
    }));

    const { generateCompletion } = await import('@/lib/claude/client');
    await expect(generateCompletion('sys', 'user')).rejects.toThrow(
      'No text response from Claude'
    );
  });

  it('throws when content array is empty', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ content: [] });

    jest.mock('@anthropic-ai/sdk', () => ({
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        messages: { create: mockCreate },
      })),
    }));

    const { generateCompletion } = await import('@/lib/claude/client');
    await expect(generateCompletion('sys', 'user')).rejects.toThrow(
      'No text response from Claude'
    );
  });
});
