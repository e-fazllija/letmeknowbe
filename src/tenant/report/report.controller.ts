import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateReportMessageDto } from './dto/create-report-message.dto';
import { CreateReportStatusDto } from './dto/create-report-status.dto';

@ApiTags('tenant-reports')
@Controller('tenant/reports')
export class ReportController {
  constructor(private service: ReportService) {}

  @Post()
  @ApiOperation({ summary: 'Crea il report con reportid nella tabella WhistleReport' })
  createReport(@Body() dto: CreateReportDto) {
    return this.service.createReport(dto);
  }

  @Get(':tenantId')
  @ApiOperation({ summary: 'Ritorna tutti i report nella tabella WhistleReport' })
  listReports(@Param('tenantId') tenantId: string) {
    return this.service.listReports(tenantId);
  }

  @Post('message')
  @ApiOperation({ summary: 'Crea il reportMessage con il relativo id nella tabella MessageReport' })
  addMessage(@Body() dto: CreateReportMessageDto) {
    return this.service.addMessage(dto);
  }

  @Get('messages/:reportId')
  @ApiOperation({ summary: 'Ritorna il reportMessage tramite reportid dalla tabella MessageReport' })
  listMessages(@Param('reportId') reportId: string) {
    return this.service.listMessages(reportId);
  }

  @Post('status')
  @ApiOperation({ summary: 'Crea lo statushistory con relativo id nella tabella ReportStatusHistory' })
  addStatus(@Body() dto: CreateReportStatusDto) {
    return this.service.addStatus(dto);
  }

  @Get('status/:reportId')
  @ApiOperation({ summary: 'Ritorna lo status del report tramite reportid dalla tabella ReportStatusHistory' })
  listStatus(@Param('reportId') reportId: string) {
    return this.service.listStatus(reportId);
  }
}
 