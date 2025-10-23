export function sanitizeUrl(input: string): string {
  try {
    // Support both absolute and relative URLs
    const base = 'http://localhost';
    const u = new URL(input, base);
    // Drop query and hash entirely to avoid leaking secrets
    return u.pathname;
  } catch {
    // Fallback: if parsing fails, strip anything after '?'
    const q = input.indexOf('?');
    return q >= 0 ? input.substring(0, q) : input;
  }
}

