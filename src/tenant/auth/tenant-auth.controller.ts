import { Body, Controller, Get, Headers, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiBearerAuth } from '@nestjs/swagger';
import { TenantAuthService } from './tenant-auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Response, Request } from 'express';
import { MfaCodeDto, MfaRecoveryDto } from './dto/mfa-code.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('tenant-auth')
@Controller('tenant/auth')
export class TenantAuthController {
  constructor(private service: TenantAuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Crea ADMIN sul db nella tabella internaluser' })
  signup(@Body() dto: SignupDto) {
    return this.service.signup(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Effettua il login di degli AGENT o ADMIN' })
  @ApiHeader({ name: 'x-tenant-id', required: true, description: 'ID del client (tenant) per il login multi-tenant' })
  @Throttle({ default: { limit: 5, ttl: 300 } })
  async login(
    @Body() dto: LoginDto,
    @Headers('x-tenant-id') tenantId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.login(dto, tenantId, req);
    if (result.kind === 'setup') {
      res.status(428);
      return {
        requireMfaSetup: true,
        setupToken: result.setupToken,
        setupUrl: '/tenant/auth/mfa/setup',
      };
    }
    if (result.kind === 'mfa') {
      return {
        mfaRequired: true,
        mfaToken: result.mfaToken,
      };
    }

    this.service.setRefreshCookie(res, result.refreshToken);
    this.service.setAccessCookie(res, result.accessToken);
    return {
      message: 'Login effettuato con successo',
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('mfa/setup')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @ApiOperation({ summary: 'Genera un segreto TOTP per abilitare la MFA' })
  @ApiHeader({ name: 'x-mfa-token', required: true, description: 'Setup token (oppure Bearer <setup_token>)' })
  mfaSetup(@Headers('x-mfa-token') mfaToken: string, @Headers('authorization') authorization: string) {
    return this.service.generateMfaSetup(mfaToken || authorization);
  }

  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @ApiOperation({ summary: 'Verifica il codice TOTP e abilita la MFA' })
  @ApiHeader({ name: 'x-mfa-token', required: true, description: 'Setup token (oppure Bearer <setup_token>)' })
  mfaVerify(
    @Headers('x-mfa-token') mfaToken: string,
    @Headers('authorization') authorization: string,
    @Body() dto: MfaCodeDto,
  ) {
    return this.service.verifyMfaSetup(mfaToken || authorization, dto);
  }

  @Post('mfa/complete')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @ApiOperation({ summary: 'Completa il login MFA con un codice TOTP valido' })
  @ApiHeader({ name: 'x-mfa-token', required: true, description: 'MFA token (oppure Bearer <mfa_token>)' })
  async mfaComplete(
    @Headers('x-mfa-token') mfaToken: string,
    @Headers('authorization') authorization: string,
    @Body() dto: MfaCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.completeMfa(mfaToken || authorization, dto, req);
    this.service.setRefreshCookie(res, result.refreshToken);
    this.service.setAccessCookie(res, result.accessToken);
    return {
      message: 'Login completato con successo',
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('mfa/recovery')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @ApiOperation({ summary: 'Completa il login MFA usando un codice di recupero' })
  @ApiHeader({ name: 'x-mfa-token', required: true, description: 'MFA token (oppure Bearer <mfa_token>)' })
  async mfaRecovery(
    @Headers('x-mfa-token') mfaToken: string,
    @Headers('authorization') authorization: string,
    @Body() dto: MfaRecoveryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.completeMfaWithRecovery(mfaToken || authorization, dto, req);
    this.service.setRefreshCookie(res, result.refreshToken);
    this.service.setAccessCookie(res, result.accessToken);
    return {
      message: 'Login completato con codice di recupero',
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ruota il refresh token ed emette un nuovo access token' })
  @Throttle({ default: { limit: 10, ttl: 300 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.service.refresh(req);
    this.service.setRefreshCookie(res, refreshToken);
    this.service.setAccessCookie(res, accessToken);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoca la sessione di refresh corrente' })
  @Throttle({ default: { limit: 10, ttl: 300 } })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.service.logout(req);
    this.service.clearRefreshCookie(res);
    this.service.clearAccessCookie(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Ritorna il profilo utente corrente (JWT access)' })
  me(@Req() req: Request) {
    const payload = (req as any).user as { sub: string };
    return this.service.buildProfile(payload.sub);
  }
}
