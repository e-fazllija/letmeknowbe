import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { ReportService } from './report.service';
// import { CreateReportDto } from './dto/create-report.dto';
// import { CreateReportMessageDto } from './dto/create-report-message.dto';
import { CreateReportStatusDto } from './dto/create-report-status.dto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Request } from 'express';
import { CreateTenantReportDto } from './dto/create-tenant-report.dto';
import { CreateTenantMessageDto, TenantMessageVisibility } from './dto/create-tenant-message.dto';
import { RequestInfoDto } from './dto/request-info.dto';
import { VoiceTranscriptDto } from './dto/voice-transcript.dto';

@ApiTags('Tenant - Segnalazioni')
@Controller('tenant/reports')
export class ReportController {
  constructor(private readonly service: ReportService) {}

  // CREA NUOVA SEGNALAZIONE (TENANT, BACKOFFICE)
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Crea una segnalazione (backoffice) con payload unificato' })
  @ApiBody({ type: CreateTenantReportDto, description: 'Supporto legacy: tipoSegnalazione/ufficio/segnalazione verranno mappati internamente (deprecato).', required: true })
  createReport(@Body() body: any, @Req() req: Request) {
    return this.service.createReportInternal(req, body);
  }

  // RECUPERA SEGNALAZIONE PUBBLICA TRAMITE TOKEN
  @Get('token/:token')
  @ApiOperation({ summary: 'Recupera una segnalazione tramite token (utente pubblico)' })
  @ApiParam({ name: 'token', description: 'Token fornito al segnalante' })
  getByToken(@Param('token') token: string) {
    return this.service.getReportByToken(token);
  }

  // DETTAGLIO SEGNALAZIONE (TENANT) CON AUTO-ACK ALLA PRIMA LETTURA
  @Get(':reportId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Dettaglio segnalazione (auto-ack alla prima lettura)' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  getDetail(@Req() req: Request, @Param('reportId') reportId: string) {
    return this.service.getDetailAndAck(req, reportId);
  }

  // ELENCO SEGNALAZIONI (PER CLIENT)
  @Get()
  @ApiOperation({ summary: 'Elenco segnalazioni per cliente (admin/agent)' })
  @ApiQuery({ name: 'clientId', required: true })
  @ApiQuery({ name: 'page', required: false, description: 'Pagina (base 1)', schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({ name: 'pageSize', required: false, description: 'Dimensione pagina (max 100)', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } })
  @ApiQuery({ name: 'status', required: false, description: 'Filtra per stato (CSV: OPEN,IN_PROGRESS,...)' })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Ricerca testuale su title/summary' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  listReports(
    @Req() req: Request,
    @Query('clientId') clientId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('departmentId') departmentId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
  ) {
    const tokenClientId = (req as any)?.user?.clientId as string | undefined;
    if (!tokenClientId || tokenClientId !== clientId) {
      // Log sintetico per audit senza esporre dati sensibili
      // eslint-disable-next-line no-console
      console.warn('listReports forbidden: token/clientId mismatch');
      throw new ForbiddenException('Operazione non consentita');
    }
    const p = Math.max(parseInt(page || '1', 10) || 1, 1);
    const psRaw = parseInt(pageSize || '20', 10) || 20;
    const ps = Math.min(Math.max(psRaw, 1), 100);
    return this.service.listReports(clientId, {
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Elenco messaggi di una segnalazione (tenant)' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  @ApiQuery({ name: 'visibility', required: false, description: 'ALL | PUBLIC | INTERNAL | SYSTEM | CSV (es. PUBLIC,INTERNAL)' })
  listMessages(@Req() req: Request, @Param('reportId') reportId: string, @Query('visibility') visibility?: string) {
    return this.service.listMessagesTenant(req, reportId, visibility);
  }

  // PATCH — AGGIORNA STATO DEL REPORT
  @Patch(':reportId/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Aggiorna lo stato della segnalazione',
    description: 'Aggiorna esclusivamente lo stato (OPEN, IN_PROGRESS, SUSPENDED, NEED_INFO, CLOSED). I timestamp vengono aggiornati per OPEN/IN_PROGRESS/CLOSED.',
  })
  updateStatus(@Req() req: Request, @Param('reportId') reportId: string, @Body() dto: CreateReportStatusDto) {
    const tokenClientId = (req as any)?.user?.clientId as string | undefined;
    if (!tokenClientId || tokenClientId !== dto.clientId) {
      // eslint-disable-next-line no-console
      console.warn('updateStatus forbidden: token/clientId mismatch');
      throw new ForbiddenException('Operazione non consentita');
    }
    return this.service.updateStatus(req, reportId, dto);
  }

// PATCH — aggiorna la nota interna di un messaggio
@Patch(':reportId/message/:messageId/note')
@UseGuards(JwtAuthGuard)
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
@UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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

  // TENANT: carica trascrizione manuale (nota INTERNAL)
  @Post(':reportId/voice/transcript')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Aggiunge una trascrizione audio (INTERNAL)', description: 'Crea un messaggio INTERNAL con il testo della trascrizione' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  @ApiBody({ type: VoiceTranscriptDto })
  addTranscript(@Req() req: Request, @Param('reportId') reportId: string, @Body() dto: VoiceTranscriptDto) {
    return this.service.addVoiceTranscript(req, reportId, dto);
  }
}


 
