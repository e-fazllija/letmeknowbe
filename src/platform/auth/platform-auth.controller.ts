import { Body, Controller, Get, HttpCode, Post, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { Throttle } from '@nestjs/throttler';
import { PlatformJwtGuard } from '../guards/platform-jwt.guard';
import { Request } from 'express';

@ApiTags('platform-auth')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(private readonly service: PlatformAuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @ApiOperation({ summary: 'Login superuser (email+password+TOTP) → access token (aud: platform)' })
  login(@Body() dto: PlatformLoginDto) {
    return this.service.login(dto);
  }

  @Get('me')
  @UseGuards(PlatformJwtGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Ritorna le claim del superuser (realm platform)' })
  me(@Req() req: Request) {
    return this.service.me((req as any).platform);
  }
}

