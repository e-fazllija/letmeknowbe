import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantAuthService } from './tenant-auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

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
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }
} 