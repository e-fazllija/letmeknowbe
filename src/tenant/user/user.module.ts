import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaTenantService } from '../prisma-tenant.service';
import { TenantModule } from '../tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService]
})
export class UserModule {}
 