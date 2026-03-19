import { parseTxt } from '@/lib/parsers/txtParser';
import { parseDocx } from '@/lib/parsers/docxParser';
import { parsePdf } from '@/lib/parsers/pdfParser';
import { parseFile } from '@/lib/parsers/index';

jest.mock('mammoth', () => ({
  extractRawText: jest.fn(),
}));

jest.mock('pdf-parse', () => jest.fn());

import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

const mockMammoth = mammoth as jest.Mocked<typeof mammoth>;
const mockPdfParse = pdfParse as jest.MockedFunction<typeof pdfParse>;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// parseTxt
// ---------------------------------------------------------------------------

describe('parseTxt', () => {
  it('returns ParsedFile with correct fields for valid text buffer', async () => {
    const buffer = Buffer.from('Hello world job description');
    const result = await parseTxt(buffer, 'job.txt');

    expect(result.text).toBe('Hello world job description');
    expect(result.filename).toBe('job.txt');
    expect(result.mimeType).toBe('text/plain');
  });

  it('trims whitespace from the extracted text', async () => {
    const buffer = Buffer.from('  trimmed text  ');
    const result = await parseTxt(buffer, 'file.txt');
    expect(result.text).toBe('trimmed text');
  });

  it('throws an error when the buffer is empty', async () => {
    const buffer = Buffer.from('');
    await expect(parseTxt(buffer, 'empty.txt')).rejects.toThrow('File is empty');
  });

  it('throws an error when buffer contains only whitespace', async () => {
    const buffer = Buffer.from('   \n\t  ');
    await expect(parseTxt(buffer, 'whitespace.txt')).rejects.toThrow('File is empty');
  });
});

// ---------------------------------------------------------------------------
// parseDocx
// ---------------------------------------------------------------------------

describe('parseDocx', () => {
  it('returns ParsedFile with correct fields on successful extraction', async () => {
    mockMammoth.extractRawText.mockResolvedValue({ value: 'Extracted docx text', messages: [] });

    const buffer = Buffer.from('fake docx bytes');
    const result = await parseDocx(buffer, 'resume.docx');

    expect(result.text).toBe('Extracted docx text');
    expect(result.filename).toBe('resume.docx');
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('passes the buffer to mammoth.extractRawText', async () => {
    mockMammoth.extractRawText.mockResolvedValue({ value: 'Some text', messages: [] });

    const buffer = Buffer.from('docx bytes');
    await parseDocx(buffer, 'doc.docx');

    expect(mockMammoth.extractRawText).toHaveBeenCalledWith({ buffer });
  });

  it('throws an error when mammoth returns empty text', async () => {
    mockMammoth.extractRawText.mockResolvedValue({ value: '', messages: [] });

    await expect(parseDocx(Buffer.from('x'), 'doc.docx')).rejects.toThrow(
      'Could not extract text from document'
    );
  });

  it('throws an error when mammoth returns only whitespace', async () => {
    mockMammoth.extractRawText.mockResolvedValue({ value: '   ', messages: [] });

    await expect(parseDocx(Buffer.from('x'), 'doc.docx')).rejects.toThrow(
      'Could not extract text from document'
    );
  });

  it('logs warnings when mammoth returns messages', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockMammoth.extractRawText.mockResolvedValue({
      value: 'Text with warnings',
      messages: [{ type: 'warning', message: 'some warning' }],
    });

    await parseDocx(Buffer.from('x'), 'doc.docx');

    expect(warnSpy).toHaveBeenCalledWith('Docx parsing warnings:', expect.any(Array));
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// parsePdf
// ---------------------------------------------------------------------------

describe('parsePdf', () => {
  it('returns ParsedFile with correct fields on successful extraction', async () => {
    mockPdfParse.mockResolvedValue({ text: 'PDF job description text' } as never);

    const buffer = Buffer.from('fake pdf bytes');
    const result = await parsePdf(buffer, 'jd.pdf');

    expect(result.text).toBe('PDF job description text');
    expect(result.filename).toBe('jd.pdf');
    expect(result.mimeType).toBe('application/pdf');
  });

  it('passes the buffer to pdf-parse', async () => {
    mockPdfParse.mockResolvedValue({ text: 'Some text' } as never);

    const buffer = Buffer.from('pdf bytes');
    await parsePdf(buffer, 'file.pdf');

    expect(mockPdfParse).toHaveBeenCalledWith(buffer);
  });

  it('throws an error when pdf-parse returns empty text', async () => {
    mockPdfParse.mockResolvedValue({ text: '' } as never);

    await expect(parsePdf(Buffer.from('x'), 'empty.pdf')).rejects.toThrow(
      'Could not extract text from PDF'
    );
  });

  it('throws an error when pdf-parse returns only whitespace', async () => {
    mockPdfParse.mockResolvedValue({ text: '   ' } as never);

    await expect(parsePdf(Buffer.from('x'), 'whitespace.pdf')).rejects.toThrow(
      'Could not extract text from PDF'
    );
  });
});

// ---------------------------------------------------------------------------
// parseFile dispatcher
// ---------------------------------------------------------------------------

describe('parseFile', () => {
  it('routes to parseTxt for text/plain mime type', async () => {
    const buffer = Buffer.from('plain text content');
    const result = await parseFile(buffer, 'file.txt', 'text/plain');

    expect(result.mimeType).toBe('text/plain');
    expect(result.text).toBe('plain text content');
  });

  it('routes to parsePdf for application/pdf mime type', async () => {
    mockPdfParse.mockResolvedValue({ text: 'PDF content' } as never);

    const result = await parseFile(Buffer.from('x'), 'file.pdf', 'application/pdf');

    expect(result.mimeType).toBe('application/pdf');
    expect(mockPdfParse).toHaveBeenCalled();
  });

  it('routes to parseDocx for docx mime type', async () => {
    mockMammoth.extractRawText.mockResolvedValue({ value: 'Docx content', messages: [] });

    const mimeType =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const result = await parseFile(Buffer.from('x'), 'file.docx', mimeType);

    expect(result.mimeType).toBe(mimeType);
    expect(mockMammoth.extractRawText).toHaveBeenCalled();
  });

  it('throws an error for unsupported mime type', async () => {
    await expect(
      parseFile(Buffer.from('x'), 'file.xyz', 'application/x-unknown')
    ).rejects.toThrow('Unsupported file type: application/x-unknown');
  });
});
