import { Module } from '@nestjs/common';
import { PublicReportController } from './public-report.controller';
import { PublicReportService } from './public-report.service';
import { TenantModule } from '../../tenant/tenant.module';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [TenantModule, StorageModule],
  controllers: [PublicReportController],
  providers: [PublicReportService],
})
export class PublicReportModule {}
