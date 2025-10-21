import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { PrismaTenantService } from '../prisma-tenant.service';
import { TenantModule } from '../tenant.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReportSlaScheduler } from './report-sla.scheduler';

@Module({
  imports: [TenantModule, JwtModule.register({})],
  controllers: [ReportController],
  providers: [ReportService, JwtAuthGuard, ReportSlaScheduler],
  exports: [ReportService],
})
export class ReportModule {}
 
