import { Module } from '@nestjs/common';
import { PrismaTenantService } from './prisma-tenant.service';
import { PublicUserModule } from './public-user/public-user.module'; 

@Module({
  imports: [PublicUserModule], 
  providers: [PrismaTenantService],
  exports: [PrismaTenantService],
})
export class TenantModule {}
