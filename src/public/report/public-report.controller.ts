import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TenantContextGuard } from '../../common/tenant/tenant-context.guard';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { PublicReportService } from './public-report.service';
import { CreatePublicReportDto } from './dto/create-public-report.dto';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PublicReplyDto } from './dto/public-reply.dto';
import { AttachmentsFinalizeDto } from './dto/attachments-finalize.dto';

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

  @Post('reports/reply')
  @ApiOperation({ summary: 'Replica del segnalante (PUBLIC)', description: 'Verifica publicCode + secret. Allegati consentiti solo con presign abilitato. Limiti: max 3 allegati, ≤10MB ciascuno, ≤20MB totali.' })
  @ApiQuery({ name: 'includeThread', required: false, description: 'Se true, include il thread PUBLIC aggiornato nella risposta' })
  @ApiBody({ type: PublicReplyDto })
  @Throttle({ default: { limit: 5, ttl: 300 } })
  reply(
    @TenantId() tenantId: string,
    @Body() dto: PublicReplyDto,
    @Req() req: Request,
    @Query('includeThread') includeThread?: string,
  ) {
    const withThread = (includeThread || '').toLowerCase() === 'true';
    return this.service.reply(tenantId, dto, req, withThread);
  }

  @Post('reports/attachments/presign')
  @ApiOperation({ summary: 'Presign per upload allegati (stub: 501 se disabilitato/non implementato)' })
  @Throttle({ default: { limit: 5, ttl: 300 } })
  presign(@TenantId() tenantId: string, @Body() body?: any) {
    return this.service.presign(tenantId, body);
  }

  @Post('reports/attachments/finalize')
  @ApiOperation({ summary: 'Finalize upload allegati (S3/MinIO): valida HMAC/ETag/size e registra in quarantena' })
  @Throttle({ default: { limit: 10, ttl: 300 } })
  finalize(@TenantId() tenantId: string, @Body() dto: AttachmentsFinalizeDto) {
    return this.service.finalize(tenantId, dto);
  }

  @Get('reports/status')
  @ApiOperation({ summary: 'Stato pubblico della segnalazione', description: 'Richiede publicCode + secret; ritorna solo informazioni sicure e il thread PUBLIC.' })
  @ApiQuery({ name: 'publicCode', required: true })
  @ApiQuery({ name: 'secret', required: true })
  @Throttle({ default: { limit: 10, ttl: 60 } })
  publicStatus(@TenantId() tenantId: string, @Query('publicCode') publicCode: string, @Query('secret') secret: string) {
    return this.service.publicStatus(tenantId, publicCode, secret);
  }
}
