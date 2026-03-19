import pdfParse from 'pdf-parse';
import { ParsedFile } from '@/types';

export async function parsePdf(buffer: Buffer, filename: string): Promise<ParsedFile> {
  const data = await pdfParse(buffer);
  const text = data.text.trim();

  if (!text) {
    throw new Error('Could not extract text from PDF');
  }

  return {
    text,
    filename,
    mimeType: 'application/pdf',
  };
}
