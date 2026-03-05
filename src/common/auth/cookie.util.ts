import { Response } from 'express';

export type SameSiteOpt = 'lax' | 'strict' | 'none';

export type CookieEnvOptions = {
  domain?: string;
  secure: boolean;
  sameSite: SameSiteOpt;
  path: string;
  accessTtlMs: number;
  refreshTtlMs: number;
};

function ttlToMs(ttl: string, fallbackMs: number): number {
  const m = ttl.match(/^(\d+)([smhd])?$/i);
  if (!m) return fallbackMs;
  const val = parseInt(m[1], 10);
  const unit = (m[2] || 's').toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60 * 1000 : unit === 'h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return val * mult;
}

export function cookieEnv(): CookieEnvOptions {
  const domain = process.env.COOKIE_DOMAIN || undefined;
  const secure = (process.env.COOKIE_SECURE || '').toLowerCase() === 'true' || process.env.NODE_ENV === 'production';
  const sameRaw = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  const sameSite: SameSiteOpt = sameRaw === 'none' ? 'none' : sameRaw === 'strict' ? 'strict' : 'lax';
  const path = '/';
  const accessTtlMs = ttlToMs(process.env.ACCESS_TTL || '900s', 15 * 60 * 1000);
  const refreshTtlMs = ttlToMs(process.env.REFRESH_TTL || '30d', 30 * 24 * 60 * 60 * 1000);
  return { domain, secure, sameSite, path, accessTtlMs, refreshTtlMs };
}

export function setAccessCookie(res: Response, token: string, opts: CookieEnvOptions) {
  res.cookie('access_token', token, {
    httpOnly: true,
    sameSite: opts.sameSite,
    secure: opts.secure,
    domain: opts.domain,
    path: opts.path,
    maxAge: opts.accessTtlMs,
  });
}

export function setRefreshCookie(res: Response, token: string, opts: CookieEnvOptions) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    sameSite: opts.sameSite,
    secure: opts.secure,
    domain: opts.domain,
    path: opts.path,
    maxAge: opts.refreshTtlMs,
  });
}

export function clearAccessCookie(res: Response, opts: CookieEnvOptions) {
  res.clearCookie('access_token', { path: opts.path, domain: opts.domain });
}

export function clearRefreshCookie(res: Response, opts: CookieEnvOptions) {
  res.clearCookie('refresh_token', { path: opts.path, domain: opts.domain });
}

