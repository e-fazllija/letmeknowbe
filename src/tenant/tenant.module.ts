import { Module } from '@nestjs/common';
import { PrismaTenantService } from './prisma-tenant.service';

@Module({
  providers: [PrismaTenantService],
  exports: [PrismaTenantService], 
})
export class TenantModule {}
