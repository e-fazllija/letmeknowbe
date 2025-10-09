import { Module } from '@nestjs/common';
import { PublicUserService } from './public-user.service';
import { PublicUserController } from './public-user.controller';
import { TenantModule } from '../tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [PublicUserController],
  providers: [PublicUserService],
})
export class PublicUserModule {}
