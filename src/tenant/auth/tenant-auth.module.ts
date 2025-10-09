import { Module } from '@nestjs/common';
import { TenantAuthService } from './tenant-auth.service';
import { TenantAuthController } from './tenant-auth.controller';
import { PrismaTenantService } from '../prisma-tenant.service';
import { TenantModule } from '../tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [TenantAuthController],
  providers: [TenantAuthService],
})
export class TenantAuthModule {}

 