import { Module } from '@nestjs/common';
import { PublicUserService } from './public-user.service';
import { PublicUserController } from './public-user.controller';
import { PrismaTenantService } from '../prisma-tenant.service';

@Module({
  controllers: [PublicUserController],
  providers: [PublicUserService, PrismaTenantService],
})
export class PublicUserModule {}
