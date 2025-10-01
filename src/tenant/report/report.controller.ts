import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateReportMessageDto } from './dto/create-report-message.dto';
import { CreateReportStatusDto } from './dto/create-report-status.dto';

@ApiTags('tenant-reports')
@Controller('tenant/reports')
export class ReportController {
  constructor(private service: ReportService) {}

  @Post()
  createReport(@Body() dto: CreateReportDto) {
    return this.service.createReport(dto);
  }

  @Get(':tenantId')
  listReports(@Param('tenantId') tenantId: string) {
    return this.service.listReports(tenantId);
  }

  @Post('message')
  addMessage(@Body() dto: CreateReportMessageDto) {
    return this.service.addMessage(dto);
  }

  @Get('messages/:reportId')
  listMessages(@Param('reportId') reportId: string) {
    return this.service.listMessages(reportId);
  }

  @Post('status')
  addStatus(@Body() dto: CreateReportStatusDto) {
    return this.service.addStatus(dto);
  }

  @Get('status/:reportId')
  listStatus(@Param('reportId') reportId: string) {
    return this.service.listStatus(reportId);
  }
}
 