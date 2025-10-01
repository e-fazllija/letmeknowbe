import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaTenantService } from '../prisma-tenant.service';

@Module({
  controllers: [UserController],
  providers: [UserService, PrismaTenantService],
  exports: [UserService]
})
export class UserModule {}
 