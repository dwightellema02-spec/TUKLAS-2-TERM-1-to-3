import { describe, expect, it } from 'vitest';
import { isCrossSiteWrite } from '../src/lib/same-origin';

const base = { method: 'POST', pathname: '/api/classes', origin: null as string | null, host: 'tuklas.example', secFetchSite: null as string | null };

describe('cross-site write protection', () => {
  it('refuses a write the browser says is cross-site, whatever else it claims', () => {
    expect(isCrossSiteWrite({ ...base, secFetchSite: 'cross-site' })).toBe(true);
    expect(isCrossSiteWrite({ ...base, secFetchSite: 'cross-site', origin: 'https://tuklas.example' })).toBe(true);
  });

  it('refuses an Origin that is another site, a look-alike, an opaque origin or garbage', () => {
    for (const origin of ['https://evil.example', 'https://tuklas.example.evil.example', 'http://tuklas.example:8080', 'null', 'not a url']) {
      expect(isCrossSiteWrite({ ...base, origin }), origin).toBe(true);
    }
  });

  it('allows the site’s own pages (same origin, same-site fetch metadata)', () => {
    expect(isCrossSiteWrite({ ...base, origin: 'https://tuklas.example', secFetchSite: 'same-origin' })).toBe(false);
    expect(isCrossSiteWrite({ ...base, origin: 'https://tuklas.example' })).toBe(false);
    expect(isCrossSiteWrite({ ...base, secFetchSite: 'same-origin' })).toBe(false);
  });

  it('does not touch non-browser clients (no Origin, no fetch metadata) or "none" (typed address / bookmark)', () => {
    expect(isCrossSiteWrite(base)).toBe(false);
    expect(isCrossSiteWrite({ ...base, secFetchSite: 'none' })).toBe(false);
  });

  it('never blocks reads or pages', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) expect(isCrossSiteWrite({ ...base, method, origin: 'https://evil.example', secFetchSite: 'cross-site' })).toBe(false);
    expect(isCrossSiteWrite({ ...base, pathname: '/student', origin: 'https://evil.example' })).toBe(false);
  });

  it('covers every write method, in any letter case', () => {
    for (const method of ['post', 'PUT', 'Patch', 'DELETE']) expect(isCrossSiteWrite({ ...base, method, origin: 'https://evil.example' }), method).toBe(true);
  });

  it('with no Host to compare against, an Origin is refused (fail closed)', () => {
    expect(isCrossSiteWrite({ ...base, host: null, origin: 'https://tuklas.example' })).toBe(true);
  });
});
