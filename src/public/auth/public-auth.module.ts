import { Module } from '@nestjs/common';
import { PublicAuthController } from './public-auth.controller';
import { PublicAuthService } from './public-auth.service';
import { TenantModule } from '../../tenant/tenant.module';
import { NotificationsModule } from '../../common/notifications/notifications.module';
import { PrismaPublicService } from '../prisma-public.service';

@Module({
  imports: [TenantModule, NotificationsModule],
  controllers: [PublicAuthController],
  providers: [PublicAuthService, PrismaPublicService],
})
export class PublicAuthModule {}

