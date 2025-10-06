import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PrismaPublicService } from '../prisma-public.service';
import { PrismaTenantService } from './../../tenant/prisma-tenant.service';

@Module({
  imports: [], // nessun modulo extra richiesto qui
  controllers: [SubscriptionController],
  providers: [
    SubscriptionService,
    PrismaPublicService,
    PrismaTenantService, // ✅ aggiunto per accesso al DB tenant
  ],
})
export class SubscriptionModule {}
