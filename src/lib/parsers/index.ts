import { ParsedFile } from '@/types';
import { parseTxt } from './txtParser';
import { parseDocx } from './docxParser';
import { parsePdf } from './pdfParser';

export type SupportedMimeType =
  | 'text/plain'
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const PARSERS: Record<SupportedMimeType, (buffer: Buffer, filename: string) => Promise<ParsedFile>> = {
  'text/plain': parseTxt,
  'application/pdf': parsePdf,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': parseDocx,
};

export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParsedFile> {
  const parser = PARSERS[mimeType as SupportedMimeType];

  if (!parser) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  return parser(buffer, filename);
}

export { parseTxt, parseDocx, parsePdf };
