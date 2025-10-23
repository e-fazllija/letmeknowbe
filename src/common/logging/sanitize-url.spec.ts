import { sanitizeUrl } from './sanitize-url';

describe('sanitizeUrl', () => {
  it('removes query string and hash', () => {
    expect(sanitizeUrl('/v1/public/reports/status?publicCode=R-XXXX&secret=ABC#frag')).toBe('/v1/public/reports/status');
  });

  it('keeps plain path unchanged', () => {
    expect(sanitizeUrl('/v1/health')).toBe('/v1/health');
  });

  it('handles absolute URLs', () => {
    expect(sanitizeUrl('https://example.com/v1/a?x=1')).toBe('/v1/a');
  });

  it('fallbacks for malformed strings', () => {
    expect(sanitizeUrl('/v1/path?x=1?y=2')).toBe('/v1/path');
  });
});

