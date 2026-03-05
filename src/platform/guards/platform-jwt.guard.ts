import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class PlatformJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = (req.headers['authorization'] as string) || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing platform access token');
    try {
      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_PLATFORM_ACCESS_SECRET || 'dev_platform_access',
        clockTolerance: 5,
      });
      if (payload?.aud && payload.aud !== 'platform') {
        throw new UnauthorizedException('Invalid audience');
      }
      req.platform = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired platform token');
    }
  }
}

