import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformAuthController } from './auth/platform-auth.controller';
import { PlatformAuthService } from './auth/platform-auth.service';
import { PlatformJwtGuard } from './guards/platform-jwt.guard';
import { PlatformClientsController } from './clients/platform-clients.controller';
import { PlatformClientsService } from './clients/platform-clients.service';
import { PrismaPublicService } from '../public/prisma-public.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PlatformAuthController, PlatformClientsController],
  providers: [PlatformAuthService, PlatformJwtGuard, PlatformClientsService, PrismaPublicService],
})
export class PlatformModule {}

