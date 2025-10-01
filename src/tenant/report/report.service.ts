import { Injectable } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateReportMessageDto } from './dto/create-report-message.dto';
import { CreateReportStatusDto } from './dto/create-report-status.dto';

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaTenantService) {}

  createReport(dto: CreateReportDto) {
    return this.prisma.whistleReport.create({
      data: {
        tenantId: dto.tenantId,
        title: dto.title,
        summary: dto.summary,
        status: dto.status,
        channel: dto.channel,
        publicCode: `PUB-${Date.now()}`,
        secretHash: `SEC-${Date.now()}`,
      },
    });
  }

  listReports(tenantId: string) {
    return this.prisma.whistleReport.findMany({
      where: { tenantId },
      include: { messages: true, statusLogs: true },
    });
  }

  addMessage(dto: CreateReportMessageDto) {
    return this.prisma.reportMessage.create({ data: dto });
  }

  listMessages(reportId: string) {
    return this.prisma.reportMessage.findMany({ where: { reportId } });
  }

  addStatus(dto: CreateReportStatusDto) {
    return this.prisma.reportStatusHistory.create({ data: dto });
  }

  listStatus(reportId: string) {
    return this.prisma.reportStatusHistory.findMany({ where: { reportId } });
  }
}
 