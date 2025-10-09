import { Module } from '@nestjs/common';
import { PrismaTenantService } from './prisma-tenant.service';

@Module({
  imports: [], //niente PublicUserModule 
  providers: [PrismaTenantService],
  exports: [PrismaTenantService], 
})
export class TenantModule {}