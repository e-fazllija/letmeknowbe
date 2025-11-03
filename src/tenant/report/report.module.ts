import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { PrismaTenantService } from '../prisma-tenant.service';
import { TenantModule } from '../tenant.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReportSlaScheduler } from './report-sla.scheduler';
import { ReportTranscriptionScheduler } from './report-transcription.scheduler';
import { AttachmentScanScheduler } from './attachment-scan.scheduler';
import { StorageModule } from '../../storage/storage.module';
import { NotificationsModule } from '../../common/notifications/notifications.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [TenantModule, JwtModule.register({}), StorageModule, NotificationsModule],
  controllers: [ReportController],
  providers: [ReportService, JwtAuthGuard, RolesGuard, ReportSlaScheduler, ReportTranscriptionScheduler, AttachmentScanScheduler],
  exports: [ReportService],
})
export class ReportModule {}
 
