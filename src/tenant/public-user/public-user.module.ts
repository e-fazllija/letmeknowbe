import { Module } from '@nestjs/common';
import { PublicUserService } from './public-user.service';
import { PublicUserController } from './public-user.controller';
import { TenantModule } from '../tenant.module';
import { ActiveClientGuard } from '../../common/guards/active-client.guard';

@Module({
  imports: [TenantModule],
  controllers: [PublicUserController],
  providers: [PublicUserService, ActiveClientGuard],
})
export class PublicUserModule {}
