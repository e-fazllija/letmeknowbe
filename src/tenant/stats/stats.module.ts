import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { TenantModule } from '../tenant.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [TenantModule, JwtModule.register({})],
  controllers: [StatsController],
  providers: [StatsService, JwtAuthGuard, RolesGuard],
})
export class StatsModule {}
