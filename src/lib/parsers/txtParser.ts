import { ParsedFile } from '@/types';

export async function parseTxt(buffer: Buffer, filename: string): Promise<ParsedFile> {
  const text = buffer.toString('utf-8').trim();

  if (!text) {
    throw new Error('File is empty');
  }

  return {
    text,
    filename,
    mimeType: 'text/plain',
  };
}
