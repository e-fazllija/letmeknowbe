import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from './../../tenant/prisma-tenant.service';
import { TenantModule } from './../../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    PrismaPublicService,
    // PrismaTenantService is provided by TenantModule
  ],
})
export class SubscriptionModule {}
