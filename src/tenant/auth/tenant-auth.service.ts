import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { Request, Response } from 'express';
import { cookieEnv, setAccessCookie as setAccessCookieUtil, setRefreshCookie as setRefreshCookieUtil, clearAccessCookie as clearAccessCookieUtil, clearRefreshCookie as clearRefreshCookieUtil } from '../../common/auth/cookie.util';
import { authenticator } from 'otplib';
import { MfaCodeDto, MfaRecoveryDto } from './dto/mfa-code.dto';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from './utils/mfa-crypto.util';

type LoginSuccessResult = {
  kind: 'success';
  user: {
    id: string;
    clientId: string;
    email: string;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
  amr: string[];
};

type LoginSetupResult = { kind: 'setup'; setupToken: string };
type LoginMfaResult = { kind: 'mfa'; mfaToken: string };
type LoginResult = LoginSuccessResult | LoginSetupResult | LoginMfaResult;

type MfaPurpose = 'mfa' | 'mfa-setup';

interface MfaTokenPayload {
  sub: string;
  clientId: string;
  purpose: MfaPurpose;
  amr: string[];
  exp: number;
  iat: number;
}

@Injectable()
export class TenantAuthService {
  constructor(private prisma: PrismaTenantService, private jwt: JwtService) {
    authenticator.options = { step: 30, digits: 6, window: 1 } as any;
  }

  private normalizeEmail(email: string) {
    return email?.trim().toLowerCase();
  }

  async signup(dto: SignupDto) {
    const email = this.normalizeEmail(dto.email);

    if (!email || !dto.password || !dto.clientId || !dto.role) {
      throw new BadRequestException('clientId, email, password e role sono obbligatori.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    try {
      const user = await this.prisma.internalUser.create({
        data: {
          clientId: dto.clientId,
          email,
          password: hashedPassword,
          role: dto.role as any, 
          status: 'ACTIVE' as any,
        },
        select: {
          id: true,
          clientId: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      return {
        message: 'Registrazione completata',
        user,
      };
    } catch (e: any) {
      if (e?.code === 'P2002' && Array.isArray(e?.meta?.target) && e.meta.target.includes('email')) {
        throw new ConflictException('Email già registrata.');
      }
      throw e;
    }
  }

  async login(dto: LoginDto, tenantId: string | undefined, req?: Request): Promise<LoginResult> {
    const email = this.normalizeEmail(dto.email);

    if (!email || !dto.password) {
      throw new BadRequestException('Email e password sono obbligatorie.');
    }
    if (!tenantId) throw new BadRequestException('x-tenant-id mancante');

    const user = await this.prisma.internalUser.findUnique({
      where: { clientId_email: { clientId: tenantId, email } },
      select: {
        id: true,
        clientId: true,
        email: true,
        role: true,
        password: true,
        status: true,
        isOwner: true,
        mfaEnabled: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenziali non valide.');
    }

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Credenziali non valide.');
    }

    if ((user as any).status && (user as any).status !== 'ACTIVE') {
      throw new UnauthorizedException('Account non attivo.');
    }

    if (user.isOwner && !user.mfaEnabled) {
      const setupToken = this.issueMfaToken(user.id, user.clientId, 'mfa-setup', ['pwd']);
      return { kind: 'setup', setupToken };
    }

    if (user.mfaEnabled) {
      const mfaToken = this.issueMfaToken(user.id, user.clientId, 'mfa', ['pwd']);
      return { kind: 'mfa', mfaToken };
    }

    return this.issueSession(user, req, ['pwd']);
  }

  async generateMfaSetup(headerOrToken: string) {
    const token = this.extractBearerToken(headerOrToken);
    const payload = this.verifyMfaToken(token, 'mfa-setup');
    const user = await this.prisma.internalUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, clientId: true, email: true },
    });
    if (!user || user.clientId !== payload.clientId) {
      throw new UnauthorizedException('Token MFA non valido');
    }

    const secret = authenticator.generateSecret();
    const encrypted = encryptMfaSecret(secret);

    await this.prisma.internalUser.update({
      where: { id: user.id },
      data: {
        mfaSecret: encrypted,
        mfaEnabled: false,
        mfaVerifiedAt: null,
      },
    });

    const issuer = process.env.MFA_ISSUER || 'LetMeKnow';
    const otpauthUrl = authenticator.keyuri(user.email, issuer, secret);
    const exposeSecret = process.env.NODE_ENV !== 'production';

    const ttl = process.env.MFA_TOKEN_TTL || '300s';
    return {
      otpauthUrl,
      expiresIn: Math.floor(this.ttlToMs(ttl) / 1000),
      ...(exposeSecret ? { secret } : {}),
    };
  }

  async verifyMfaSetup(headerOrToken: string, dto: MfaCodeDto) {
    const token = this.extractBearerToken(headerOrToken);
    const payload = this.verifyMfaToken(token, 'mfa-setup');
    const user = await this.prisma.internalUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, clientId: true, mfaSecret: true },
    });
    if (!user || user.clientId !== payload.clientId) {
      throw new UnauthorizedException('Token MFA non valido');
    }
    if (!user.mfaSecret) {
      throw new BadRequestException('Segreto MFA non inizializzato');
    }

    const secret = decryptMfaSecret(user.mfaSecret);
    const isValid = authenticator.verify({ token: dto.code, secret });
    if (!isValid) {
      throw new UnauthorizedException('Codice MFA non valido');
    }

    const recoveryCodes = generateRecoveryCodes();
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.internalUser.update({
        where: { id: user.id },
        data: {
          mfaEnabled: true,
          mfaVerifiedAt: now,
        },
      }),
      this.prisma.userRecoveryCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.userRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: user.id,
          codeHash: hashRecoveryCode(code, user.id),
        })),
      }),
    ]);

    return {
      message: 'MFA attivata con successo',
      recoveryCodes,
    };
  }

  async completeMfa(headerOrToken: string, dto: MfaCodeDto, req: Request) {
    const token = this.extractBearerToken(headerOrToken);
    const payload = this.verifyMfaToken(token, 'mfa');
    const user = await this.prisma.internalUser.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        clientId: true,
        email: true,
        role: true,
        mfaSecret: true,
        mfaEnabled: true,
      },
    });
    if (!user || user.clientId !== payload.clientId) {
      throw new UnauthorizedException('Token MFA non valido');
    }
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA non attiva per questo utente');
    }

    const secret = decryptMfaSecret(user.mfaSecret);
    const isValid = authenticator.verify({ token: dto.code, secret });
    if (!isValid) {
      throw new UnauthorizedException('Codice MFA non valido');
    }

    return this.issueSession(user, req, ['pwd', 'mfa'], { mfaAt: new Date() });
  }

  async completeMfaWithRecovery(headerOrToken: string, dto: MfaRecoveryDto, req: Request) {
    const token = this.extractBearerToken(headerOrToken);
    const payload = this.verifyMfaToken(token, 'mfa');
    const user = await this.prisma.internalUser.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        clientId: true,
        email: true,
        role: true,
        mfaEnabled: true,
      },
    });
    if (!user || user.clientId !== payload.clientId) {
      throw new UnauthorizedException('Token MFA non valido');
    }
    if (!user.mfaEnabled) {
      throw new BadRequestException('MFA non attiva per questo utente');
    }

    const codeHash = hashRecoveryCode(dto.code, user.id);
    const recovery = await this.prisma.userRecoveryCode.findFirst({
      where: { userId: user.id, codeHash, usedAt: null },
    });
    if (!recovery) {
      throw new UnauthorizedException('Codice di recupero non valido o già usato');
    }

    await this.prisma.userRecoveryCode.update({
      where: { id: recovery.id },
      data: { usedAt: new Date() },
    });

    return this.issueSession(user, req, ['pwd', 'mfa'], { mfaAt: new Date() });
  }

  // Helpers: emettere access token
  private issueMfaToken(userId: string, clientId: string, purpose: MfaPurpose, amr: string[]) {
    const ttl = process.env.MFA_TOKEN_TTL || '300s';
    const expiresIn = Math.floor(this.ttlToMs(ttl) / 1000);
    return this.jwt.sign(
      { sub: userId, clientId, purpose, amr },
      {
        secret: process.env.JWT_MFA_SECRET || 'dev_mfa_secret',
        expiresIn,
      },
    );
  }

  private verifyMfaToken(token: string, expected: MfaPurpose): MfaTokenPayload {
    try {
      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_MFA_SECRET || 'dev_mfa_secret',
        clockTolerance: 5,
      }) as MfaTokenPayload;
      if (payload.purpose !== expected) {
        throw new UnauthorizedException('Token MFA non valido');
      }
      return payload;
    } catch (e) {
      throw new UnauthorizedException('Token MFA non valido');
    }
  }

  private extractBearerToken(input?: string): string {
    if (!input) throw new UnauthorizedException('MFA token mancante');
    const trimmed = input.trim();
    if (/^bearer\s+/i.test(trimmed)) {
      return trimmed.replace(/^bearer\s+/i, '').trim();
    }
    // Se arriva già solo il token, accettalo
    return trimmed;
  }

  private async issueSession(
    user: {
      id: string;
      clientId: string;
      email: string;
      role: string;
    },
    req: Request | undefined,
    amr: string[],
    options: { mfaAt?: Date } = {},
  ): Promise<LoginSuccessResult> {
    const accessToken = this.issueAccessToken(
      { sub: user.id, clientId: user.clientId, role: user.role },
      amr,
      options.mfaAt,
    );

    const { refreshToken } = await this.createRefreshSession(user.id, user.clientId, req);

    return {
      kind: 'success',
      user: {
        id: user.id,
        clientId: user.clientId,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
      amr,
    };
  }

  private issueAccessToken(payload: { sub: string; clientId: string; role: string }, amr: string[], mfaAt?: Date) {
    const ttl = process.env.ACCESS_TTL || '900s';
    const expiresIn = Math.floor(this.ttlToMs(ttl) / 1000);
    const tokenPayload: Record<string, any> = {
      ...payload,
      amr,
    };
    if (mfaAt) {
      tokenPayload.mfaAt = Math.floor(mfaAt.getTime() / 1000);
    }
    return this.jwt.sign(tokenPayload, {
      secret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
      expiresIn,
    });
  }

  // Helpers: crea sessione refresh e ritorna token in chiaro
  private async createRefreshSession(userId: string, clientId: string, req?: Request) {
    const ttl = process.env.REFRESH_TTL || '30d';
    // jti
    const jti = crypto.randomUUID();
    const refreshExpiresIn = Math.floor(this.ttlToMs(ttl) / 1000);
    const refreshToken = this.jwt.sign({ sub: userId, clientId, jti }, {
      secret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
      expiresIn: refreshExpiresIn,
    });
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = this.addTtlToNow(ttl);

    await this.prisma.refreshSession.create({
      data: {
        id: jti,
        userId,
        clientId,
        hash,
        expiresAt,
        ip: reqIp(req) || undefined,
        ua: reqUa(req) || undefined,
      },
    });

    return { refreshToken };
  }

  async refresh(req: Request) {
    const token = (req.cookies && (req.cookies['refresh_token'] as string)) || '';
    if (!token) throw new UnauthorizedException('Missing refresh token');

    let payload: any;
    try {
      payload = this.jwt.verify(token, { secret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret' });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.refreshSession.findUnique({ where: { id: payload.jti } });
    if (!session) throw new UnauthorizedException('Session not found');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    if (session.hash !== hash) throw new UnauthorizedException('Refresh token mismatch');
    if (session.revokedAt) throw new UnauthorizedException('Refresh token revoked');
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    // rotate
    await this.prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const { refreshToken } = await this.createRefreshSession(session.userId, session.clientId, req);

    const user = await this.prisma.internalUser.findUnique({
      where: { id: session.userId },
      select: { role: true, mfaEnabled: true },
    });
    const role = user?.role || 'ADMIN';
    const amr = user?.mfaEnabled ? ['pwd', 'mfa'] : ['pwd'];
    const accessToken = this.issueAccessToken(
      { sub: session.userId, clientId: session.clientId, role },
      amr,
      user?.mfaEnabled ? new Date() : undefined,
    );

    return { accessToken, refreshToken };
  }

  async logout(req: Request) {
    const token = (req.cookies && (req.cookies['refresh_token'] as string)) || '';
    if (!token) return;
    try {
      const payload: any = this.jwt.verify(token, { secret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret' });
      await this.prisma.refreshSession.update({ where: { id: payload.jti }, data: { revokedAt: new Date() } });
    } catch {
      // ignora
    }
  }

  setRefreshCookie(res: Response, refreshToken: string) {
    const opts = cookieEnv();
    setRefreshCookieUtil(res, refreshToken, opts);
  }

  setAccessCookie(res: Response, accessToken: string) {
    const opts = cookieEnv();
    setAccessCookieUtil(res, accessToken, opts);
  }

  clearRefreshCookie(res: Response) {
    const opts = cookieEnv();
    clearRefreshCookieUtil(res, opts);
  }

  clearAccessCookie(res: Response) {
    const opts = cookieEnv();
    clearAccessCookieUtil(res, opts);
  }

  private addTtlToNow(ttl: string): Date {
    return new Date(Date.now() + this.ttlToMs(ttl));
  }

  private ttlToMs(ttl: string): number {
    const m = ttl.match(/^(\d+)([smhd])?$/);
    if (!m) return 30 * 24 * 60 * 60 * 1000;
    const val = parseInt(m[1], 10);
    const unit = m[2] || 's';
    const mult = unit === 's' ? 1000 : unit === 'm' ? 60 * 1000 : unit === 'h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return val * mult;
  }

  async buildProfile(userId: string) {
    const user = await this.prisma.internalUser.findUnique({
      where: { id: userId },
      select: { id: true, clientId: true, email: true, role: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const role = (user.role || 'ADMIN').toString();
    const roleLower = role.toLowerCase();
    const permissions = this.permissionsForRole(role);

    return {
      userId: user.id,
      clientId: user.clientId,
      email: user.email,
      role: roleLower,
      permissions,
    };
  }

  private permissionsForRole(role: string): string[] {
    switch (role) {
      case 'ADMIN':
        return ['REPORTS_VIEW', 'REPORT_CREATE'];
      case 'AGENT':
        return ['REPORTS_VIEW', 'REPORT_CREATE'];
      case 'AUDITOR':
        return ['REPORTS_VIEW'];
      default:
        return ['REPORTS_VIEW'];
    }
  }
}

// helpers che leggono basilari req info quando disponibili
function reqIp(req?: Request): string | undefined {
  if (!req) return undefined;
  return (req.headers['x-forwarded-for'] as string) || req.ip;
}
function reqUa(req?: Request): string | undefined {
  if (!req) return undefined;
  return (req.headers['user-agent'] as string) || undefined;
}
 
