import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    success: true,
    data: { service: 'tuklas-v2', status: 'ok' },
    error: null,
  });
}
