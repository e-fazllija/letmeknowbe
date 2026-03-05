import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { cookieEnv } from '../auth/cookie.util';

const PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  const enabled = (process.env.CSRF_PROTECTION || '').toLowerCase() === 'true';
  if (!enabled) return next();

  // Issue XSRF-TOKEN cookie if missing (non-HttpOnly)
  const opts = cookieEnv();
  let existing = req.cookies && (req.cookies['XSRF-TOKEN'] as string);
  if (!existing) {
    existing = crypto.randomBytes(16).toString('hex');
    res.cookie('XSRF-TOKEN', existing, {
      httpOnly: false,
      sameSite: opts.sameSite,
      secure: opts.secure,
      domain: opts.domain,
      path: opts.path,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  // Skip safe methods and refresh/webhook endpoints
  if (!PROTECTED_METHODS.has((req.method || 'GET').toUpperCase())) return next();
  const url = req.originalUrl || req.url || '';
  if (url.includes('/v1/public/stripe/webhook')) return next();
  if (url.includes('/v1/tenant/auth/refresh')) return next();

  const header = (req.headers['x-csrf-token'] as string) || '';
  if (!header || header !== existing) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }

  next();
}

