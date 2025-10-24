import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantModule } from '../tenant.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [TenantModule, JwtModule.register({})],
  controllers: [BillingController],
  providers: [BillingService, JwtAuthGuard, RolesGuard],
})
export class BillingModule {}

