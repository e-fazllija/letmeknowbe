import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

function isTrue(v?: string) {
  return v === '1' || (v || '').toLowerCase() === 'true';
}

function parseAllowlist(env?: string): string[] {
  return (env || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

@Injectable()
export class PlatformOptionalGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // Feature flag: when disabled, allow all (dev-friendly)
    const protect = isTrue(process.env.PLATFORM_PROTECT_PUBLIC_ADMIN);
    if (!protect) return true;

    // Optional IP allowlist
    const allowIps = parseAllowlist(process.env.PLATFORM_IP_ALLOWLIST);
    if (allowIps.length > 0) {
      const xff = (req.headers['x-forwarded-for'] as string) || '';
      const ipChain = xff ? xff.split(',').map((s: string) => s.trim()) : [];
      const ip = (ipChain[0] || req.ip || req.socket?.remoteAddress || '').trim();
      if (!ip || !allowIps.includes(ip)) {
        throw new ForbiddenException('IP non autorizzato');
      }
    }

    // Require platform access token (Bearer)
    const auth = (req.headers['authorization'] as string) || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing platform access token');

    try {
      const payload: any = this.jwt.verify(token, {
        secret: process.env.JWT_PLATFORM_ACCESS_SECRET || 'dev_platform_access',
        clockTolerance: 5,
      });

      // Audience/Issuer soft enforcement
      const expectedAud = (process.env.PLATFORM_JWT_AUD || 'platform').trim();
      if (payload?.aud && expectedAud && payload.aud !== expectedAud) {
        throw new UnauthorizedException('Invalid audience');
      }
      const expectedIss = (process.env.PLATFORM_JWT_ISS || '').trim();
      if (expectedIss && payload?.iss && payload.iss !== expectedIss) {
        throw new UnauthorizedException('Invalid issuer');
      }

      req.platform = payload;
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired platform token');
    }
  }
}

