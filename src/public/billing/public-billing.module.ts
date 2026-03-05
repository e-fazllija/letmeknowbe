import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PublicBillingController } from './public-billing.controller';
import { PublicBillingService } from './public-billing.service';
import { PrismaPublicService } from '../prisma-public.service';
import { TenantModule } from '../../tenant/tenant.module';
import { StripeService } from '../../common/stripe/stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';

@Module({
  imports: [TenantModule, JwtModule.register({})],
  controllers: [PublicBillingController, StripeWebhookController],
  providers: [
    PublicBillingService,
    StripeWebhookService,
    PrismaPublicService,
    StripeService,
  ],
})
export class PublicBillingModule {}
