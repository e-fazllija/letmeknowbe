import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantAuthService } from './tenant-auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('tenant-auth')
@Controller('tenant/auth')
export class TenantAuthController {
  constructor(private service: TenantAuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.service.signup(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }
}
 