import { NextRequest, NextResponse } from 'next/server';
import { parseFile } from '@/lib/parsers';
import { FileUploadSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file
    const validation = FileUploadSchema.safeParse({
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    });

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid file', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseFile(buffer, file.name, file.type);

    return NextResponse.json({ text: parsed.text });
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse file' },
      { status: 500 }
    );
  }
}
