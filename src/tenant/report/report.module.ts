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
import { ReportRetentionScheduler } from './report-retention.scheduler';
import { StorageModule } from '../../storage/storage.module';
import { NotificationsModule } from '../../common/notifications/notifications.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ActiveClientGuard } from '../../common/guards/active-client.guard';
import { JobLockService } from '../../common/job-lock.service';
import { PrismaPublicService } from '../../public/prisma-public.service';
import { SlaOrchestratorService } from './sla-orchestrator.service';
import { SlaPerTenantService } from './sla-per-tenant.service';
import { RetentionOrchestratorService } from './retention-orchestrator.service';
import { RetentionPerTenantService } from './retention-per-tenant.service';

@Module({
  imports: [TenantModule, JwtModule.register({}), StorageModule, NotificationsModule],
  controllers: [ReportController],
  providers: [
    ReportService,
    JwtAuthGuard,
    RolesGuard,
    ActiveClientGuard,
    PrismaPublicService,
    JobLockService,
    SlaOrchestratorService,
    SlaPerTenantService,
    RetentionOrchestratorService,
    RetentionPerTenantService,
    ReportSlaScheduler,
    ReportTranscriptionScheduler,
    AttachmentScanScheduler,
    ReportRetentionScheduler,
  ],
  exports: [ReportService],
})
export class ReportModule {}
 
