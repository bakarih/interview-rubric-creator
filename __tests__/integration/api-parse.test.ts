import { NextRequest } from 'next/server';
import { POST } from '@/app/api/parse/route';

jest.mock('pdf-parse', () => jest.fn());
jest.mock('mammoth', () => ({
  extractRawText: jest.fn(),
}));

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const mockPdfParse = pdfParse as jest.MockedFunction<typeof pdfParse>;
const mockMammoth = mammoth as jest.Mocked<typeof mammoth>;

// Helper to create a multipart FormData request with a file
function makeFileRequest(
  content: string | null,
  filename: string,
  mimeType: string,
  size?: number
): NextRequest {
  const formData = new FormData();

  if (content !== null) {
    let file: File;
    if (size !== undefined) {
      // Create a large enough content to simulate the oversized file
      // We need 5MB+1 bytes to exceed the limit
      const largeContent = 'x'.repeat(size);
      file = new File([largeContent], filename, { type: mimeType });
    } else {
      file = new File([content], filename, { type: mimeType });
    }
    formData.append('file', file);
  }

  return new NextRequest('http://localhost/api/parse', {
    method: 'POST',
    body: formData,
  });
}

function makeEmptyFormDataRequest(): NextRequest {
  const formData = new FormData();
  return new NextRequest('http://localhost/api/parse', {
    method: 'POST',
    body: formData,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/parse
// ---------------------------------------------------------------------------

describe('POST /api/parse', () => {
  it('returns 400 when no file is provided', async () => {
    const request = makeEmptyFormDataRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('No file provided');
  });

  it('returns 400 for an unsupported mime type', async () => {
    const request = makeFileRequest('some content', 'image.png', 'image/png');
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid file');
  });

  it('returns 400 for an oversized file', async () => {
    const oversizedSize = 5 * 1024 * 1024 + 1;
    const request = makeFileRequest('content', 'big.txt', 'text/plain', oversizedSize);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Invalid file');
  });

  it('returns 200 with parsed text for a valid TXT file', async () => {
    const content = 'We are looking for a talented software engineer to join our growing team.';
    const request = makeFileRequest(content, 'jd.txt', 'text/plain');
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.text).toBe(content);
  });

  it('returns 200 with parsed text for a valid PDF file', async () => {
    mockPdfParse.mockResolvedValue({ text: 'PDF job description content' } as never);

    const request = makeFileRequest('%PDF-1.4 content', 'jd.pdf', 'application/pdf');
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.text).toBe('PDF job description content');
  });

  it('returns 200 with parsed text for a valid DOCX file', async () => {
    mockMammoth.extractRawText.mockResolvedValue({
      value: 'DOCX job description content',
      messages: [],
    });

    const mimeType =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const request = makeFileRequest('fake docx bytes', 'jd.docx', mimeType);
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.text).toBe('DOCX job description content');
  });

  it('returns 500 when the parser throws an error', async () => {
    mockPdfParse.mockRejectedValue(new Error('PDF parsing failed'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const request = makeFileRequest('bad pdf', 'corrupt.pdf', 'application/pdf');
    const response = await POST(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Failed to parse file');
    consoleSpy.mockRestore();
  });
});
