import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantModule } from '../tenant.module';
import { CasePolicyController } from './case-policy.controller';
import { CasePolicyService } from './case-policy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActiveClientGuard } from '../../common/guards/active-client.guard';

@Module({
  imports: [TenantModule, JwtModule.register({})],
  controllers: [CasePolicyController],
  providers: [CasePolicyService, JwtAuthGuard, RolesGuard, ActiveClientGuard],
})
export class CasePolicyModule {}

