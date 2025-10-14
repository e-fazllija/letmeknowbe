import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PlatformLoginDto } from './dto/platform-login.dto';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

@Injectable()
export class PlatformAuthService {
  constructor(private readonly jwt: JwtService) {
    authenticator.options = { step: 30, digits: 6 } as any;
  }

  async login(dto: PlatformLoginDto) {
    const email = dto.email?.trim().toLowerCase();
    const envEmail = (process.env.PLATFORM_SUPER_EMAIL || '').trim().toLowerCase();
    const envHash = process.env.PLATFORM_SUPER_HASH || '';
    const totpSecret = process.env.PLATFORM_MFA_SECRET || '';

    if (!envEmail || !envHash) throw new BadRequestException('Platform superuser non configurato');
    if (!email || !dto.password || !dto.code) throw new BadRequestException('Dati mancanti');

    if (email !== envEmail) throw new UnauthorizedException('Credenziali non valide');
    const ok = await bcrypt.compare(dto.password, envHash);
    if (!ok) throw new UnauthorizedException('Credenziali non valide');

    if (!totpSecret) throw new BadRequestException('MFA non configurata');
    const valid = authenticator.verify({ token: dto.code, secret: totpSecret });
    if (!valid) throw new UnauthorizedException('Codice MFA non valido');

    const ttl = process.env.PLATFORM_ACCESS_TTL || '14400s';
    const expiresIn = this.ttlToSeconds(ttl);
    const token = this.jwt.sign(
      {
        sub: 'platform-super',
        role: 'PLATFORM_ADMIN',
        aud: 'platform',
        email: envEmail,
      },
      {
        secret: process.env.JWT_PLATFORM_ACCESS_SECRET || 'dev_platform_access',
        expiresIn,
      },
    );

    return { accessToken: token };
  }

  me(payload: any) {
    return { user: payload };
  }

  private ttlToSeconds(ttl: string): number {
    const m = ttl.match(/^(\d+)([smhd])?$/);
    if (!m) return 14400;
    const val = parseInt(m[1], 10);
    const unit = m[2] || 's';
    const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    return val * mult;
  }
}

