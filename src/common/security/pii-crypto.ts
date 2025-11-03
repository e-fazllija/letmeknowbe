import crypto from 'crypto';

function b64u(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64u(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

export function parseKeyFromEnv(envName = 'REPORTER_DATA_ENC_KEY'): Buffer {
  const raw = (process.env[envName] || '').trim();
  if (!raw) throw new Error(`${envName} missing`);
  // accept base64 or hex
  let key: Buffer | null = null;
  try { key = Buffer.from(raw, 'base64'); } catch {}
  if (!key || key.length !== 32) {
    try { key = Buffer.from(raw, 'hex'); } catch {}
  }
  if (!key || key.length !== 32) throw new Error(`${envName} must be 32 bytes (base64 or hex)`);
  return key;
}

export function encryptPII(plain: string, key: Buffer, aad?: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(Buffer.from(String(plain), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${b64u(iv)}:${b64u(ct)}:${b64u(tag)}`;
}

export function decryptPII(enc: string, key: Buffer, aad?: string): string {
  if (!enc) return '';
  const parts = enc.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unsupported enc format');
  const iv = fromB64u(parts[1]);
  const ct = fromB64u(parts[2]);
  const tag = fromB64u(parts[3]);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

