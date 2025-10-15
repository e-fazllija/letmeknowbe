import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TenantContextGuard } from '../../common/tenant/tenant-context.guard';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { PublicReportService } from './public-report.service';
import { CreatePublicReportDto } from './dto/create-public-report.dto';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Public - Reports')
@ApiSecurity('tenant-key')
@Controller('public')
@UseGuards(TenantContextGuard)
export class PublicReportController {
  constructor(private service: PublicReportService) {}

  @Get('departments')
  @ApiOperation({ summary: 'Reparti attivi del tenant (per selettore form)' })
  listDepartments(@TenantId() tenantId: string) {
    return this.service.listDepartments(tenantId);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Categorie attive per reparto (per selettore form)' })
  @ApiQuery({ name: 'departmentId', required: true })
  listCategories(@TenantId() tenantId: string, @Query('departmentId') departmentId: string) {
    return this.service.listCategories(tenantId, departmentId);
  }

  @Post('reports')
  @ApiOperation({ summary: 'Crea una nuova segnalazione (form pubblico)' })
  @ApiBody({ type: CreatePublicReportDto })
  @Throttle({ default: { limit: 5, ttl: 300 } })
  createReport(@TenantId() tenantId: string, @Body() dto: CreatePublicReportDto, @Req() req: Request) {
    return this.service.createReport(tenantId, dto, req);
  }

  @Post('reports/attachments/presign')
  @ApiOperation({ summary: 'Presign per upload allegati (stub: 501 se disabilitato/non implementato)' })
  @Throttle({ default: { limit: 5, ttl: 300 } })
  presign(@TenantId() tenantId: string) {
    return this.service.presign(tenantId);
  }
}
