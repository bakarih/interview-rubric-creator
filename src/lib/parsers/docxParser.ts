import mammoth from 'mammoth';
import { ParsedFile } from '@/types';

export async function parseDocx(buffer: Buffer, filename: string): Promise<ParsedFile> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();

  if (!text) {
    throw new Error('Could not extract text from document');
  }

  if (result.messages.length > 0) {
    console.warn('Docx parsing warnings:', result.messages);
  }

  return {
    text,
    filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}
