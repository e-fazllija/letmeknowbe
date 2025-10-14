import * as crypto from 'crypto';

const DEFAULT_KEY = 'letmeknow_dev_mfa_secret_key';

function getKey(): Buffer {
  const raw = process.env.MFA_ENC_KEY || DEFAULT_KEY;
  // Usa SHA-256 per derivare una chiave a 32 byte da qualunque input
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptMfaSecret(secret: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // AES-GCM richiede IV da 12 byte
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), encrypted.toString('base64'), tag.toString('base64')].join('.');
}

export function decryptMfaSecret(payload: string): string {
  const [ivB64, dataB64, tagB64] = payload.split('.');
  if (!ivB64 || !dataB64 || !tagB64) {
    throw new Error('Invalid MFA secret payload');
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function hashRecoveryCode(code: string, userId: string): string {
  const pepper = process.env.RECOVERY_CODE_PEPPER || 'letmeknow_dev_recovery_pepper';
  return crypto.createHash('sha256').update(`${code}:${userId}:${pepper}`).digest('hex');
}

export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    // 10 bytes → 20 char base32 approx; usiamo base32 per leggibilità
    const code = crypto.randomBytes(10).toString('hex');
    codes.push(code);
  }
  return codes;
}

