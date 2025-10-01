import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { PrismaTenantService } from '../prisma-tenant.service';

@Module({
  controllers: [ReportController],
  providers: [ReportService, PrismaTenantService],
})
export class ReportModule {}
 