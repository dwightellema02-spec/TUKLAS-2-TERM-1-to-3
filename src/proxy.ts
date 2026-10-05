import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCrossSiteWrite } from './lib/same-origin';

/** Refuses browser-originated cross-site writes to the API before any route code runs (see lib/same-origin.ts). */
export function proxy(request: NextRequest) {
  const refused = isCrossSiteWrite({
    method: request.method,
    pathname: request.nextUrl.pathname,
    origin: request.headers.get('origin'),
    host: request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    secFetchSite: request.headers.get('sec-fetch-site'),
  });
  if (refused) {
    return NextResponse.json({ success: false, data: null, error: 'Cross-site request refused.' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
