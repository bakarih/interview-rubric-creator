import { NextRequest } from 'next/server';
import { POST } from '@/app/api/generate/route';

jest.mock('@/lib/claude/client', () => ({
  generateCompletion: jest.fn(),
}));

import { generateCompletion } from '@/lib/claude/client';

const mockGenerateCompletion = generateCompletion as jest.MockedFunction<
  typeof generateCompletion
>;

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

const generatedRubricPayload = {
  signals: [
    {
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
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/generate
// ---------------------------------------------------------------------------

describe('POST /api/generate', () => {
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

  it('returns 200 with a valid rubric on success', async () => {
    mockGenerateCompletion.mockResolvedValue(JSON.stringify(generatedRubricPayload));

    const request = makeRequest({
      role: 'Software Engineer',
      level: 'senior',
      signals: validSignals,
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.role).toBe('Software Engineer');
    expect(body.level).toBe('senior');
    expect(body.signals).toHaveLength(1);
    expect(body.version).toBe('1.0.0');
  });

  it('returns 200 with a valid UUID id on the rubric', async () => {
    mockGenerateCompletion.mockResolvedValue(JSON.stringify(generatedRubricPayload));

    const request = makeRequest({
      role: 'Software Engineer',
      level: 'senior',
      signals: validSignals,
    });
    const response = await POST(request);

    const body = await response.json();
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(body.id).toMatch(uuidPattern);
  });

  it('returns 200 with a valid createdAt ISO timestamp', async () => {
    mockGenerateCompletion.mockResolvedValue(JSON.stringify(generatedRubricPayload));

    const request = makeRequest({
      role: 'Software Engineer',
      level: 'senior',
      signals: validSignals,
    });
    const response = await POST(request);

    const body = await response.json();
    expect(body.createdAt).toBeDefined();
    expect(() => new Date(body.createdAt)).not.toThrow();
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
  });

  it('assigns a unique UUID to each signal in the rubric', async () => {
    const multiSignalPayload = {
      signals: [
        { ...generatedRubricPayload.signals[0], name: 'Signal 1' },
        { ...generatedRubricPayload.signals[0], name: 'Signal 2' },
      ],
    };
    mockGenerateCompletion.mockResolvedValue(JSON.stringify(multiSignalPayload));

    const request = makeRequest({
      role: 'Software Engineer',
      level: 'senior',
      signals: validSignals,
    });
    const response = await POST(request);

    const body = await response.json();
    expect(body.signals).toHaveLength(2);
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(body.signals[0].id).toMatch(uuidPattern);
    expect(body.signals[1].id).toMatch(uuidPattern);
    // Each signal should have a different UUID
    expect(body.signals[0].id).not.toBe(body.signals[1].id);
  });

  it('returns 500 when Claude throws an error', async () => {
    mockGenerateCompletion.mockRejectedValue(new Error('Claude API is down'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const request = makeRequest({
      role: 'Software Engineer',
      level: 'senior',
      signals: validSignals,
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to generate rubric');
    consoleSpy.mockRestore();
  });

  it('returns 500 when Claude returns invalid JSON', async () => {
    mockGenerateCompletion.mockResolvedValue('{invalid json}}}');

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const request = makeRequest({
      role: 'Software Engineer',
      level: 'senior',
      signals: validSignals,
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to generate rubric');
    consoleSpy.mockRestore();
  });

  it('calls generateCompletion with correct maxTokens option', async () => {
    mockGenerateCompletion.mockResolvedValue(JSON.stringify(generatedRubricPayload));

    const request = makeRequest({
      role: 'Software Engineer',
      level: 'senior',
      signals: validSignals,
    });
    await POST(request);

    expect(mockGenerateCompletion).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { maxTokens: 8192 }
    );
  });
});
