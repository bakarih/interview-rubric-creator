import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json({
    commit: process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'unknown',
    deployedAt: process.env.NEXT_PUBLIC_DEPLOYED_AT ?? 'unknown',
  });
}
