import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, Res, UseGuards, ForbiddenException, BadRequestException, NotImplementedException, NotFoundException } from '@nestjs/common';
import { ReportService } from './report.service';
// import { CreateReportDto } from './dto/create-report.dto';
// import { CreateReportMessageDto } from './dto/create-report-message.dto';
import { CreateReportStatusDto } from './dto/create-report-status.dto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Request } from 'express';
import { Response } from 'express';
import { CreateTenantReportDto } from './dto/create-tenant-report.dto';
import { CreateTenantMessageDto, TenantMessageVisibility } from './dto/create-tenant-message.dto';
import { RequestInfoDto } from './dto/request-info.dto';
import { VoiceTranscriptDto } from './dto/voice-transcript.dto';
import { Roles } from '../../common/guards/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { S3StorageService } from '../../storage/s3-storage.service';
import { AttachmentsFinalizeDto } from '../../public/report/dto/attachments-finalize.dto';
import * as crypto from 'crypto';

@ApiTags('Tenant - Segnalazioni')
@ApiBearerAuth('access-token')
@Controller('tenant/reports')
export class ReportController {
  constructor(private readonly service: ReportService, private storage: S3StorageService) {}

  // CREA NUOVA SEGNALAZIONE (TENANT, BACKOFFICE)
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Crea una segnalazione (backoffice) con payload unificato' })
  @ApiBody({ type: CreateTenantReportDto, description: 'Supporto legacy: tipoSegnalazione/ufficio/segnalazione verranno mappati internamente (deprecato).', required: true })
  createReport(@Body() body: any, @Req() req: Request) {
    return this.service.createReportInternal(req, body);
  }

  // RECUPERA SEGNALAZIONE PUBBLICA TRAMITE TOKEN
  @Get('token/:token')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Recupera una segnalazione tramite token (utente pubblico)' })
  @ApiParam({ name: 'token', description: 'Token fornito al segnalante' })
  getByToken(@Param('token') token: string) {
    return this.service.getReportByToken(token);
  }

  // DETTAGLIO SEGNALAZIONE (TENANT) CON AUTO-ACK ALLA PRIMA LETTURA
  @Get(':reportId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT', 'AUDITOR')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Dettaglio segnalazione (auto-ack alla prima lettura)' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  getDetail(@Req() req: Request, @Param('reportId') reportId: string) {
    return this.service.getDetailAndAck(req, reportId);
  }

  // ELENCO ALLEGATI DELLA SEGNALAZIONE
  @Get(':reportId/attachments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT', 'AUDITOR')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Elenco allegati (metadata) della segnalazione' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  listAttachments(@Req() req: Request, @Param('reportId') reportId: string) {
    return this.service.listAttachments(req, reportId);
  }

  // ELENCO SEGNALAZIONI (PER CLIENT)
  @Get()
  @ApiOperation({ summary: 'Elenco segnalazioni per cliente (admin/agent)', description: 'Parametro clientId opzionale: se assente viene usato quello del token JWT' })
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'page', required: false, description: 'Pagina (base 1)', schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Dimensione pagina (max 100)', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
  @ApiQuery({ name: 'status', required: false, description: 'Filtra per stato (CSV: OPEN,IN_PROGRESS,...)' })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Ricerca testuale su title/summary' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT', 'AUDITOR')
  @ApiBearerAuth('access-token')
  listReports(
    @Req() req: Request,
    @Query('clientId') clientId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
  ) {
    const tokenClientId = (req as any)?.user?.clientId as string | undefined;
    const effectiveClientId = clientId || tokenClientId;
    if (!tokenClientId || !effectiveClientId || tokenClientId !== effectiveClientId) {
      // Log sintetico per audit senza esporre dati sensibili
      // eslint-disable-next-line no-console
      console.warn('listReports forbidden: token/clientId mismatch');
      throw new ForbiddenException('Operazione non consentita');
    }
    const p = Math.max(parseInt(page || '1', 10) || 1, 1);
    const psRaw = parseInt(pageSize || '20', 10) || 20;
    const ps = Math.min(Math.max(psRaw, 1), 100);
    return this.service.listReports(req, effectiveClientId, {
      page: p,
      pageSize: ps,
      status,
      departmentId,
      categoryId,
      q,
    });
  }

  // AGGIUNGE UNA NOTA (INTERNAL) O UN MESSAGGIO (PUBLIC) AL REPORT
  @Post('message')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Aggiunge una nota interna (INTERNAL) o un messaggio pubblico (PUBLIC) al report' })
  @ApiBody({
    type: CreateTenantMessageDto,
    examples: {
      notaInterna: {
        summary: 'Nota interna (non visibile al segnalante)',
        value: { reportId: 'rep_cuid_123', body: 'Promemoria per il team', visibility: 'INTERNAL' },
      },
      messaggioPubblico: {
        summary: 'Messaggio al segnalante (visibile pubblicamente)',
        value: { reportId: 'rep_cuid_123', body: 'Per favore indica data e luogo dell\'evento', visibility: 'PUBLIC' },
      },
    },
  })
  addMessage(@Req() req: Request, @Body() dto: CreateTenantMessageDto) {
    return this.service.addTenantMessage(req, dto);
  }

  // ELENCO MESSAGGI DI UNA SEGNALAZIONE
  @Get(':reportId/messages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Elenco messaggi di una segnalazione (tenant)' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  @ApiQuery({ name: 'visibility', required: false, description: 'ALL | PUBLIC | INTERNAL | SYSTEM | CSV (es. PUBLIC,INTERNAL)' })
  listMessages(@Req() req: Request, @Param('reportId') reportId: string, @Query('visibility') visibility?: string) {
    return this.service.listMessagesTenant(req, reportId, visibility);
  }

  // PATCH — AGGIORNA STATO DEL REPORT
  @Patch(':reportId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Aggiorna lo stato della segnalazione',
    description: 'Aggiorna esclusivamente lo stato (OPEN, IN_PROGRESS, SUSPENDED, NEED_INFO, CLOSED). I timestamp vengono aggiornati per OPEN/IN_PROGRESS/CLOSED.',
  })
  updateStatus(@Req() req: Request, @Param('reportId') reportId: string, @Body() dto: CreateReportStatusDto) {
    return this.service.updateStatus(req, reportId, dto);
  }

// PATCH — aggiorna la nota interna di un messaggio
@Patch(':reportId/message/:messageId/note')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'AGENT')
@ApiBearerAuth('access-token')
@ApiOperation({
  summary: 'Aggiorna la nota di un messaggio (solo INTERNAL)',
  description: 'Consente update solo per messaggi INTERNAL. PUBLIC/SYSTEM → 403.',
})
@ApiParam({ name: 'reportId', description: 'ID del report' })
@ApiParam({ name: 'messageId', description: 'ID del messaggio' })
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      note: { type: 'string', example: 'Nota riservata o appunto interno' },
    },
    required: ['note'],
  },
})
updateMessageNote(
  @Req() req: Request,
  @Param('reportId') reportId: string,
  @Param('messageId') messageId: string,
  @Body('note') note: string,
) {
  return this.service.updateMessageNoteTenant(req, reportId, messageId, note);
}

// PATCH — aggiorna il contenuto (body) del messaggio
@Patch(':reportId/message/:messageId/body')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'AGENT')
@ApiBearerAuth('access-token')
@ApiOperation({
  summary: 'Aggiorna il contenuto (body) di un messaggio (solo INTERNAL)',
  description: 'Consente update solo per messaggi INTERNAL. PUBLIC/SYSTEM → 403.',
})
@ApiParam({ name: 'reportId', description: 'ID del report' })
@ApiParam({ name: 'messageId', description: 'ID del messaggio' })
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      body: { type: 'string', example: 'Testo aggiornato del messaggio' },
    },
    required: ['body'],
  },
})
updateMessageBody(
  @Req() req: Request,
  @Param('reportId') reportId: string,
  @Param('messageId') messageId: string,
  @Body('body') body: string,
) {
  return this.service.updateMessageBodyTenant(req, reportId, messageId, body);
}

  // DELETE — ELIMINA UNA SEGNALAZIONE COMPLETA
  @Delete(':reportId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Elimina una segnalazione',
    description: 'Rimuove la segnalazione e tutti i dati collegati (messaggi, utenti pubblici).',
  })
  deleteReport(@Req() req: Request, @Param('reportId') reportId: string) {
    return this.service.deleteReport(req, reportId);
  }

  // AZIONE RAPIDA: Richiesta chiarimenti (set NEED_INFO + messaggio pubblico)
  @Post(':reportId/request-info')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Richiedi chiarimenti al segnalante',
    description: 'Imposta lo stato a NEED_INFO (con audit SYSTEM) e invia un messaggio PUBLIC al segnalante.',
  })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  @ApiBody({
    type: RequestInfoDto,
    examples: {
      richiesta: {
        summary: 'Esempio richiesta',
        value: { message: 'Puoi indicare data e luogo dell\'evento?', note: 'Mancano dettagli minimi' },
      },
    },
  })
  requestInfo(@Req() req: Request, @Param('reportId') reportId: string, @Body() dto: RequestInfoDto) {
    return this.service.requestInfo(req, reportId, dto);
  }

  // TENANT: Presign allegati (backoffice)
  @Post('attachments/presign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Presign per upload allegati (backoffice, S3/MinIO)' })
  @ApiBody({ schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'object', properties: { fileName: { type: 'string' }, mimeType: { type: 'string' }, sizeBytes: { type: 'number' } } } } } } })
  async presignTenant(@Req() req: Request, @Body() body?: any) {
    const tenantId = (req as any)?.user?.clientId as string | undefined;
    if (!tenantId) throw new BadRequestException('Tenant non valido');
    const presignEnabled = (process.env.PRESIGN_ENABLED || '').toLowerCase() === 'true' || process.env.PRESIGN_ENABLED === '1';
    if (!presignEnabled) throw new NotImplementedException('Presign disabilitato');

    const mode = (process.env.PRESIGN_MODE || '').toUpperCase();
    const toBytes = (mb: number) => Math.floor(mb * 1024 * 1024);
    const EXT_FOR_MIME: Record<string, string[]> = {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
    };
    const getExt = (name?: string) => {
      if (!name) return '';
      const i = name.lastIndexOf('.');
      return i >= 0 ? name.substring(i).toLowerCase() : '';
    };
    const hmacSha256Hex = (key: string, data: string) => crypto.createHmac('sha256', key).update(data).digest('hex');

    if (mode === 'MOCK') {
      const maxFileBytes = toBytes(parseInt(process.env.ATTACH_MAX_FILE_MB || '10', 10));
      const proofSecret = process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';
      const makeItem = (file?: { fileName?: string; mimeType?: string; sizeBytes?: number }) => {
        const id = (crypto as any).randomUUID ? (crypto as any).randomUUID() : crypto.randomBytes(16).toString('hex');
        const extFromName = file?.fileName ? getExt(file.fileName) : '';
        const extFromMime = file?.mimeType ? (EXT_FOR_MIME[file.mimeType]?.[0] || '') : '';
        const ext = extFromName || extFromMime || '';
        const storageKey = `${tenantId}/tmp/${id}${ext}`;
        const mime = file?.mimeType || 'application/octet-stream';
        const proof = hmacSha256Hex(proofSecret, storageKey);
        return { storageKey, method: 'PUT', uploadUrl: `https://example.invalid/upload/${encodeURIComponent(storageKey)}`, headers: { 'content-type': mime }, maxSizeBytes: maxFileBytes, expiresIn: 300, proof };
      };
      const items = Array.isArray(body?.files) && body.files.length > 0 ? body.files.map((f: any) => makeItem(f)) : [makeItem()];
      return { items };
    }

    if (mode === 'REAL') {
      const itemsInput: Array<{ fileName?: string; mimeType?: string; sizeBytes?: number }> = Array.isArray(body?.files) && body.files.length > 0 ? body.files : [{}];
      const bucket = process.env.S3_BUCKET_TMP || '';
      const sseMode = ((process.env.S3_SSE_MODE || 'S3').toUpperCase() as any) || 'S3';
      const kmsKeyId = process.env.S3_KMS_KEY_ID || undefined;
      const proofSecret = process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';
      const results: any[] = [];
      for (const f of itemsInput) {
        const id = (crypto as any).randomUUID ? (crypto as any).randomUUID() : crypto.randomBytes(16).toString('hex');
        const extFromName = f?.fileName ? getExt(f.fileName) : '';
        const extFromMime = f?.mimeType ? (EXT_FOR_MIME[f.mimeType]?.[0] || '') : '';
        const ext = extFromName || extFromMime || '';
        const storageKey = `${tenantId}/tmp/${id}${ext}`;
        const presigned = await this.storage.presignPut({ bucket, key: storageKey, contentType: f?.mimeType || 'application/octet-stream', expiresInSeconds: 300, sseMode, kmsKeyId });
        const proof = hmacSha256Hex(proofSecret, storageKey);
        results.push({ storageKey, method: 'PUT', uploadUrl: presigned.uploadUrl, headers: presigned.headers, maxSizeBytes: toBytes(parseInt(process.env.ATTACH_MAX_FILE_MB || '10', 10)), expiresIn: presigned.expiresIn, proof });
      }
      return { items: results };
    }

    throw new NotImplementedException('Presign non implementato');
  }

  // TENANT: Finalize allegati (backoffice)
  @Post('attachments/finalize')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Finalize upload allegati (backoffice): valida HMAC/ETag/size su TMP' })
  @ApiBody({ type: AttachmentsFinalizeDto })
  async finalizeTenant(@Req() req: Request, @Body() dto: AttachmentsFinalizeDto) {
    const tenantId = (req as any)?.user?.clientId as string | undefined;
    if (!tenantId) throw new BadRequestException('Tenant non valido');
    const items = Array.isArray(dto?.items) ? dto.items : [];
    if (items.length === 0) throw new BadRequestException('Nessun elemento da finalizzare');

    const bucketTmp = process.env.S3_BUCKET_TMP || '';
    const finalizeSecret = process.env.UPLOAD_FINALIZE_SECRET || process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';

    const accepted: any[] = [];
    const rejected: any[] = [];
    const hmacSha256Hex = (key: string, data: string) => crypto.createHmac('sha256', key).update(data).digest('hex');

    for (const it of items) {
      try {
        if (!it.storageKey || !it.storageKey.startsWith(`${tenantId}/tmp/`)) throw new BadRequestException('storageKey non valido');
        if (it.hmac) {
          const expected = hmacSha256Hex(finalizeSecret, it.storageKey);
          if (expected !== it.hmac) throw new BadRequestException('HMAC non valido');
        }
        const head = await this.storage.headObject(bucketTmp, it.storageKey);
        if (!head) throw new NotFoundException('Oggetto non trovato');
        if (typeof it.sizeBytes === 'number' && head.contentLength != null && head.contentLength !== it.sizeBytes) {
          throw new BadRequestException('Dimensione non coerente');
        }
        if (it.etag && head.etag && head.etag.replace(/\"/g, '') !== it.etag.replace(/\"/g, '')) {
          throw new BadRequestException('ETag non coerente');
        }
        accepted.push({ storageKey: it.storageKey, etag: head.etag, sizeBytes: head.contentLength ?? it.sizeBytes });
      } catch (e: any) {
        rejected.push({ storageKey: it.storageKey, reason: e?.message || 'invalid' });
      }
    }

    return { accepted, rejected };
  }

  // TENANT: carica trascrizione manuale (nota INTERNAL)
  @Post(':reportId/voice/transcript')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Aggiunge una trascrizione audio (INTERNAL)', description: 'Crea un messaggio INTERNAL con il testo della trascrizione' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  @ApiBody({ type: VoiceTranscriptDto })
  addTranscript(@Req() req: Request, @Param('reportId') reportId: string, @Body() dto: VoiceTranscriptDto) {
    return this.service.addVoiceTranscript(req, reportId, dto);
  }

  // LOGS DI ACCESSO (ADMIN/AUDITOR)
  @Get(':reportId/logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'Access log del report (view/export)' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  getLogs(@Req() req: Request, @Param('reportId') reportId: string) {
    return this.service.getAccessLogs(req, reportId);
  }

  // EXPORT PDF (ADMIN/AUDITOR)
  @Get(':reportId/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'Esporta il report in PDF (engine MOCK/PDFKIT)' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  @Header('Content-Type', 'application/pdf')
  async export(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('reportId') reportId: string) {
    const { buffer, filename } = await this.service.exportPdf(req, reportId);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return buffer;
  }

  // ASSEGNAZIONI
  @Post(':reportId/assign/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'AGENT')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Assegna a sé stessi il caso (se unassigned)', description: 'Race safe: fallisce se già assegnato' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  assignMe(@Req() req: Request, @Param('reportId') reportId: string) {
    return this.service.assignMe(req, reportId);
  }

  @Post(':reportId/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Assegna il caso a un altro utente (ADMIN)' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  @ApiBody({ schema: { type: 'object', properties: { userId: { type: 'string' } }, required: ['userId'] } })
  assignTo(@Req() req: Request, @Param('reportId') reportId: string, @Body('userId') userId: string) {
    return this.service.assignTo(req, reportId, userId);
  }

  @Post(':reportId/unassign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Rimuove l\'assegnazione (ADMIN)' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  unassign(@Req() req: Request, @Param('reportId') reportId: string) {
    return this.service.unassign(req, reportId);
  }
}


 
