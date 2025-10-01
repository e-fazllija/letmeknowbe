import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PrismaPublicService } from '../prisma-public.service';

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, PrismaPublicService],
})
export class SubscriptionModule {}
 