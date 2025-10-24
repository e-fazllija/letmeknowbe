import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { TenantModule } from '../tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}

