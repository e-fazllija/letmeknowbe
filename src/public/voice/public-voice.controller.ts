import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TenantContextGuard } from '../../common/tenant/tenant-context.guard';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { PublicVoiceService } from './public-voice.service';
import { CreateVoiceReportDto } from './dto/create-voice-report.dto';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Public - Voice')
@ApiSecurity('tenant-key')
@Controller('public/voice')
@UseGuards(TenantContextGuard)
export class PublicVoiceController {
  constructor(private service: PublicVoiceService) {}

  @Post('attachments/presign')
  @ApiOperation({ summary: 'Presign per upload audio (stub: 501 se disabilitato)' })
  @Throttle({ default: { limit: 5, ttl: 300 } })
  presign(@TenantId() tenantId: string, @Body() body?: any) {
    return this.service.presign(tenantId, body);
  }

  @Post('reports')
  @ApiOperation({ summary: 'Crea una segnalazione vocale (audio allegato, trascrizione async futura)' })
  @ApiBody({ type: CreateVoiceReportDto })
  @Throttle({ default: { limit: 5, ttl: 300 } })
  create(@TenantId() tenantId: string, @Body() dto: CreateVoiceReportDto, @Req() req: Request) {
    return this.service.createVoiceReport(tenantId, dto, req);
  }
}
