import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from './../../tenant/prisma-tenant.service';
import { TenantModule } from './../../tenant/tenant.module';
import { PlatformOptionalGuard } from '../../platform/guards/platform-optional.guard';

@Module({
  imports: [TenantModule, JwtModule.register({})],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    PrismaPublicService,
    PlatformOptionalGuard,
    // PrismaTenantService da TenantModule
  ],
})
export class SubscriptionModule {}
