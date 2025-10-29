import { Body, Controller, Post, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TenantContextGuard } from '../../common/tenant/tenant-context.guard';
import { TenantId } from '../../common/tenant/tenant.decorator';
import { PublicVoiceService } from './public-voice.service';
import { CreateVoiceReportDto } from './dto/create-voice-report.dto';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { TranscribeRequestDto } from './dto/transcribe-request.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import * as multer from 'multer';

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

  @Post('transcribe')
  @ApiOperation({ summary: 'Trascrive audio (multipart o storageKey) e opzionalmente include metadati allegato' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio_file: { type: 'string', format: 'binary', description: 'File audio (webm/ogg/wav/mp3). In alternativa usa storageKey.' },
        storageKey: { type: 'string', description: 'Chiave S3 di un audio già caricato' },
        modelName: { type: 'string', example: 'turbo' },
        includeAudio: { type: 'boolean', example: false, description: "Se true ritorna i metadati per includere l'audio nel report (richiede S3 se invii un file)" },
        reportId: { type: 'string', example: 'rep_cuid_123', description: 'Opzionale: se presente e includeAudio=true, allega subito al report (richiede secret)' },
        secret: { type: 'string', example: 'plain-secret-consegnato-al-segnalante', description: 'Opzionale: secret pubblico per validare l\'accesso al report quando si allega' }
      },
    },
  })
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @UseInterceptors(FileInterceptor('audio_file', { storage: multer.memoryStorage() }))
  transcribe(
    @TenantId() tenantId: string,
    @UploadedFile() file: any,
    @Body() body: any,
  ) {
    return this.service.transcribeGateway(tenantId, file, body);
  }

  @Post('transcribe/upload')
  @ApiOperation({ summary: 'Trascrive un audio caricato (multipart) tramite Whisper locale (mock friendly)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        audio_file: { type: 'string', format: 'binary', description: 'File audio (webm/ogg/wav/mp3)' },
        modelName: { type: 'string', example: 'turbo' },
      },
      required: ['audio_file'],
    },
  })
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @UseInterceptors(FileInterceptor('audio_file', { storage: multer.memoryStorage() }))
  transcribeUpload(
    @TenantId() tenantId: string,
    @UploadedFile() file: any,
    @Body('modelName') modelName?: string,
  ) {
    return this.service.transcribeFromUpload(tenantId, file, modelName);
  }
}
