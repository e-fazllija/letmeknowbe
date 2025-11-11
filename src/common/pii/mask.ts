export function maskPII(input?: string): string {
  if (!input) return '';
  let s = String(input);
  // email
  s = s.replace(/([A-Z0-9._%+-])[A-Z0-9._%+-]*(@[A-Z0-9.-]+\.[A-Z]{2,})/gi, (_m, p1, p2) => `${p1}***${p2}`);
  // phone (simple patterns, last 3 visible)
  s = s.replace(/\b(\+?\d[\d\s\-\.]{6,}\d)\b/g, (m) => m.replace(/\d(?=\d{3})/g, '*'));
  // IBAN: keep country+2, mask middle
  s = s.replace(/\b([A-Z]{2}\d{2})([A-Z0-9]{6,})(\d{2})\b/gi, (_m, a, mid, b) => `${a}${mid.replace(/./g, '*')}${b}`);
  // Codice fiscale (IT): 16 chars alnum
  s = s.replace(/\b([A-Z]{6})([A-Z0-9]{4})([A-Z0-9]{6})\b/gi, (_m, a, _mid, c) => `${a}****${c}`);
  return s;
}

export function shortHash(input: string): string {
  const crypto = require('crypto');
  const h = crypto.createHash('sha256').update(input).digest('hex');
  return h.slice(0, 8);
}

