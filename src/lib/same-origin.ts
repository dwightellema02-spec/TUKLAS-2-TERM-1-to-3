/**
 * Tuklas 2.0 — Cross-site request protection (CSRF defence in depth).
 *
 * Session cookies are HttpOnly and SameSite=Lax, which already stops browsers sending them on cross-site POSTs. This adds a
 * second, independent check at the front door: a state-changing request to /api/* that a BROWSER marks as coming from another
 * site is refused. Browsers set `Origin` and `Sec-Fetch-Site` themselves; a web page cannot forge them. Requests without these
 * headers (curl, server-to-server, tests) are not browser requests and are not affected: they carry no ambient cookie risk.
 */

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type OriginCheckInput = {
  method: string;
  pathname: string;
  origin: string | null;
  host: string | null;
  secFetchSite: string | null;
};

/** True when this request must be refused as a cross-site write. */
export function isCrossSiteWrite({ method, pathname, origin, host, secFetchSite }: OriginCheckInput): boolean {
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;
  if (!pathname.startsWith('/api/')) return false;

  // The browser says so itself: this came from another site.
  if (secFetchSite === 'cross-site') return true;

  // An Origin that is not this site. ("null" is sent by sandboxed frames and some redirects: not this site either.)
  if (origin !== null) {
    if (origin === 'null') return true;
    try {
      return !host || new URL(origin).host !== host;
    } catch {
      return true;
    }
  }
  return false;
}
