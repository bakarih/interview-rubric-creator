import { NextRequest } from 'next/server';
import { POST } from '@/app/api/extract/route';

jest.mock('@/lib/claude/client', () => ({
  generateCompletion: jest.fn(),
}));

import { generateCompletion } from '@/lib/claude/client';

const mockGenerateCompletion = generateCompletion as jest.MockedFunction<
  typeof generateCompletion
>;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validExtractedJD = {
  role: 'Senior Software Engineer',
  level: 'senior',
  department: 'Engineering',
  company: 'Acme Corp',
  requirements: ['5 years TypeScript', 'React experience'],
  responsibilities: ['Build features', 'Mentor juniors'],
  qualifications: {
    required: ['BS in Computer Science'],
    preferred: ['Open source contributions'],
  },
  signals: [
    {
      name: 'React proficiency',
      category: 'technical_skills',
      importance: 'critical',
      evidence: 'Requires 3+ years React',
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/extract
// ---------------------------------------------------------------------------

describe('POST /api/extract', () => {
  it('returns 400 when text is missing', async () => {
    const request = makeRequest({});
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid input');
  });

  it('returns 400 when text is too short (less than 100 characters)', async () => {
    const request = makeRequest({ text: 'Too short' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid input');
  });

  it('returns 400 with validation details when text is too short', async () => {
    const request = makeRequest({ text: 'short' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.details).toBeDefined();
  });

  it('returns 200 with extracted data on success', async () => {
    mockGenerateCompletion.mockResolvedValue(JSON.stringify(validExtractedJD));

    const longText = 'a'.repeat(150);
    const request = makeRequest({ text: longText });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.role).toBe('Senior Software Engineer');
    expect(body.level).toBe('senior');
  });

  it('attaches rawText to the extracted response', async () => {
    mockGenerateCompletion.mockResolvedValue(JSON.stringify(validExtractedJD));

    const longText = 'b'.repeat(150);
    const request = makeRequest({ text: longText });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rawText).toBe(longText);
  });

  it('returns 500 when Claude throws an error', async () => {
    mockGenerateCompletion.mockRejectedValue(new Error('API error'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const longText = 'c'.repeat(150);
    const request = makeRequest({ text: longText });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to extract job description');
    consoleSpy.mockRestore();
  });

  it('returns 500 when Claude returns invalid JSON', async () => {
    mockGenerateCompletion.mockResolvedValue('not valid json {{{');

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const longText = 'd'.repeat(150);
    const request = makeRequest({ text: longText });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to extract job description');
    consoleSpy.mockRestore();
  });

  it('passes the JD text to generateCompletion', async () => {
    mockGenerateCompletion.mockResolvedValue(JSON.stringify(validExtractedJD));

    const longText = 'e'.repeat(150);
    const request = makeRequest({ text: longText });
    await POST(request);

    expect(mockGenerateCompletion).toHaveBeenCalledTimes(1);
    const [systemPrompt, userMessage] = mockGenerateCompletion.mock.calls[0];
    expect(systemPrompt).toContain('JSON');
    expect(userMessage).toContain(longText);
  });
});
