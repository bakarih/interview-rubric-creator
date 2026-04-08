import { NextRequest } from 'next/server';
import { POST } from '@/app/api/generate/route';

jest.mock('@/lib/claude/client', () => ({
  getClaudeClient: jest.fn(),
}));

import { getClaudeClient } from '@/lib/claude/client';

const mockGetClaudeClient = getClaudeClient as jest.MockedFunction<typeof getClaudeClient>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock async-iterable stream from an array of text chunks.
 * The route iterates over `content_block_delta` / `text_delta` events.
 */
function makeMockStream(textChunks: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of textChunks) {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
      }
    },
  };
}

/**
 * Read all SSE events emitted by a streaming Response body.
 * Returns the parsed JSON payloads (the part after "data: ").
 */
async function readSSEEvents(response: Response): Promise<Array<Record<string, unknown>>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<Record<string, unknown>> = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        events.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
      }
    }
  }

  return events;
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validSignals = [
  {
    name: 'React proficiency',
    category: 'technical_skills',
    importance: 'critical',
    evidence: 'Requires 3+ years of React',
  },
];

// A single valid NDJSON signal line that the model would produce
const signalLine = JSON.stringify({
  name: 'React proficiency',
  description: 'Candidate can build production React apps',
  weight: 9,
  criteria: {
    exceeds: 'Expert-level React, contributes to OSS',
    meets: 'Builds features independently',
    below: 'Needs guidance on React fundamentals',
  },
  suggestedModality: 'pair_programming',
  suggestedQuestions: [
    'Walk me through a complex React component you built',
    'How do you handle state management?',
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/generate — validation
// ---------------------------------------------------------------------------

describe('POST /api/generate — validation', () => {
  it('returns 400 when request body is not valid JSON', async () => {
    const request = new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'this is not valid json {{{',
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid request body');
  });

  it('returns 400 when role is missing', async () => {
    const request = makeRequest({ level: 'senior', signals: validSignals });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Missing required fields');
  });

  it('returns 400 when level is missing', async () => {
    const request = makeRequest({ role: 'Software Engineer', signals: validSignals });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Missing required fields');
  });

  it('returns 400 when signals array is empty', async () => {
    const request = makeRequest({ role: 'Software Engineer', level: 'senior', signals: [] });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Missing required fields');
  });

  it('returns 400 when signals is missing entirely', async () => {
    const request = makeRequest({ role: 'Software Engineer', level: 'senior' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Missing required fields');
  });
});

// ---------------------------------------------------------------------------
// POST /api/generate — streaming success path
// ---------------------------------------------------------------------------

describe('POST /api/generate — streaming', () => {
  function setupMockStream(textChunks: string[]) {
    const mockMessages = {
      stream: jest.fn().mockReturnValue(makeMockStream(textChunks)),
    };
    mockGetClaudeClient.mockReturnValue({
      messages: mockMessages,
    } as unknown as ReturnType<typeof getClaudeClient>);
    return mockMessages;
  }

  it('responds with Content-Type text/event-stream', async () => {
    setupMockStream([signalLine + '\n']);

    const response = await POST(
      makeRequest({ role: 'Software Engineer', level: 'senior', signals: validSignals })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('emits a signal event for each parsed NDJSON line', async () => {
    setupMockStream([signalLine + '\n']);

    const response = await POST(
      makeRequest({ role: 'Software Engineer', level: 'senior', signals: validSignals })
    );

    const events = await readSSEEvents(response);
    const signalEvents = events.filter((e) => e.type === 'signal');

    expect(signalEvents).toHaveLength(1);
    expect(signalEvents[0].signal).toMatchObject({ name: 'React proficiency', weight: 9 });
  });

  it('assigns a unique UUID id to each streamed signal', async () => {
    const secondLine = JSON.stringify({ ...JSON.parse(signalLine), name: 'Leadership' });
    setupMockStream([signalLine + '\n' + secondLine + '\n']);

    const response = await POST(
      makeRequest({ role: 'Software Engineer', level: 'senior', signals: validSignals })
    );

    const events = await readSSEEvents(response);
    const signalEvents = events.filter((e) => e.type === 'signal');

    expect(signalEvents).toHaveLength(2);

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sig0 = signalEvents[0].signal as Record<string, unknown>;
    const sig1 = signalEvents[1].signal as Record<string, unknown>;
    expect(sig0.id).toMatch(uuidPattern);
    expect(sig1.id).toMatch(uuidPattern);
    expect(sig0.id).not.toBe(sig1.id);
  });

  it('emits a done event with role, level, version, and a valid UUID id', async () => {
    setupMockStream([signalLine + '\n']);

    const response = await POST(
      makeRequest({ role: 'Software Engineer', level: 'senior', signals: validSignals })
    );

    const events = await readSSEEvents(response);
    const doneEvent = events.find((e) => e.type === 'done');

    expect(doneEvent).toBeDefined();
    expect(doneEvent!.role).toBe('Software Engineer');
    expect(doneEvent!.level).toBe('senior');
    expect(doneEvent!.version).toBe('1.0.0');

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(String(doneEvent!.id)).toMatch(uuidPattern);
  });

  it('emits a done event with a valid ISO createdAt timestamp', async () => {
    setupMockStream([signalLine + '\n']);

    const response = await POST(
      makeRequest({ role: 'Software Engineer', level: 'senior', signals: validSignals })
    );

    const events = await readSSEEvents(response);
    const doneEvent = events.find((e) => e.type === 'done')!;

    expect(doneEvent.createdAt).toBeDefined();
    expect(new Date(doneEvent.createdAt as string).toISOString()).toBe(doneEvent.createdAt);
  });

  it('handles signal data split across multiple chunks', async () => {
    // Simulate the line arriving in two separate text_delta events
    const half = Math.floor(signalLine.length / 2);
    setupMockStream([signalLine.slice(0, half), signalLine.slice(half) + '\n']);

    const response = await POST(
      makeRequest({ role: 'Software Engineer', level: 'senior', signals: validSignals })
    );

    const events = await readSSEEvents(response);
    const signalEvents = events.filter((e) => e.type === 'signal');

    expect(signalEvents).toHaveLength(1);
    expect(signalEvents[0].signal).toMatchObject({ name: 'React proficiency' });
  });

  it('flushes a signal that arrives without a trailing newline', async () => {
    // No trailing \n — should be flushed after the stream ends
    setupMockStream([signalLine]);

    const response = await POST(
      makeRequest({ role: 'Software Engineer', level: 'senior', signals: validSignals })
    );

    const events = await readSSEEvents(response);
    const signalEvents = events.filter((e) => e.type === 'signal');

    expect(signalEvents).toHaveLength(1);
  });

  it('silently skips lines that are not valid JSON', async () => {
    setupMockStream(['not valid json\n', signalLine + '\n']);

    const response = await POST(
      makeRequest({ role: 'Software Engineer', level: 'senior', signals: validSignals })
    );

    const events = await readSSEEvents(response);
    const signalEvents = events.filter((e) => e.type === 'signal');

    // Only the valid line should produce a signal
    expect(signalEvents).toHaveLength(1);
  });

  it('silently skips markdown fence lines', async () => {
    setupMockStream(['```json\n', signalLine + '\n', '```\n']);

    const response = await POST(
      makeRequest({ role: 'Software Engineer', level: 'senior', signals: validSignals })
    );

    const events = await readSSEEvents(response);
    const signalEvents = events.filter((e) => e.type === 'signal');

    expect(signalEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/generate — error path
// ---------------------------------------------------------------------------

describe('POST /api/generate — errors', () => {
  it('emits an error event when the Claude stream throws', async () => {
    const mockMessages = {
      stream: jest.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          throw new Error('Claude API is down');
        },
      }),
    };
    mockGetClaudeClient.mockReturnValue({
      messages: mockMessages,
    } as unknown as ReturnType<typeof getClaudeClient>);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(
      makeRequest({ role: 'Software Engineer', level: 'senior', signals: validSignals })
    );

    expect(response.status).toBe(200); // SSE response is always 200; error arrives in the stream
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');

    const events = await readSSEEvents(response);
    const errorEvent = events.find((e) => e.type === 'error');

    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toBe('Failed to generate rubric');

    consoleSpy.mockRestore();
  });
});
