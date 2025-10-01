import { Module } from '@nestjs/common';
import { TenantAuthService } from './tenant-auth.service';
import { TenantAuthController } from './tenant-auth.controller';
import { PrismaTenantService } from '../prisma-tenant.service';

@Module({
  controllers: [TenantAuthController],
  providers: [TenantAuthService, PrismaTenantService],
})
export class TenantAuthModule {}

 