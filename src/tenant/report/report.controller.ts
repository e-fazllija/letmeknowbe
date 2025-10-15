import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateReportMessageDto } from './dto/create-report-message.dto';
import { CreateReportStatusDto } from './dto/create-report-status.dto';
import { ApiOperation, ApiTags, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiTags('Tenant - Segnalazioni')
@Controller('tenant/reports')
export class ReportController {
  constructor(private readonly service: ReportService) {}

  // CREA NUOVA SEGNALAZIONE ANONIMA
  @Post()
  @ApiOperation({ summary: 'Crea una nuova segnalazione anonima' })
  createReport(@Body() dto: CreateReportDto) {
    return this.service.createReport(dto);
  }

  // RECUPERA SEGNALAZIONE PUBBLICA TRAMITE TOKEN
  @Get('token/:token')
  @ApiOperation({ summary: 'Recupera una segnalazione tramite token (utente pubblico)' })
  @ApiParam({ name: 'token', description: 'Token fornito al segnalante' })
  getByToken(@Param('token') token: string) {
    return this.service.getReportByToken(token);
  }

  // ELENCO SEGNALAZIONI (PER CLIENT)
  @Get()
  @ApiOperation({ summary: 'Elenco segnalazioni per cliente (admin/agent)' })
  @ApiQuery({ name: 'clientId', required: true })
  listReports(@Query('clientId') clientId: string) {
    return this.service.listReports(clientId);
  }

  // AGGIUNGE UN MESSAGGIO
  @Post('message')
  @ApiOperation({ summary: 'Aggiunge un messaggio a una segnalazione' })
  addMessage(@Body() dto: CreateReportMessageDto) {
    return this.service.addMessage(dto);
  }

  // ELENCO MESSAGGI DI UNA SEGNALAZIONE
  @Get(':reportId/messages')
  @ApiOperation({ summary: 'Elenco messaggi di una segnalazione' })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  listMessages(@Param('reportId') reportId: string) {
    return this.service.listMessages(reportId);
  }

  // PATCH — AGGIORNA STATO DEL REPORT
  @Patch(':reportId/status')
  @ApiOperation({
    summary: 'Aggiorna lo stato della segnalazione',
    description: 'Aggiorna esclusivamente lo stato (OPEN, IN_PROGRESS, SUSPENDED, NEED_INFO, CLOSED). I timestamp vengono aggiornati per OPEN/IN_PROGRESS/CLOSED.',
  })
  updateStatus(@Param('reportId') reportId: string, @Body() dto: CreateReportStatusDto) {
    return this.service.updateStatus(reportId, dto);
  }

// PATCH — aggiorna la nota interna di un messaggio
@Patch(':reportId/message/:messageId/note')
@ApiOperation({
  summary: 'Aggiorna la nota interna di un messaggio',
  description: 'Permette ad admin o agent di aggiornare note riservate interne a un messaggio.',
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
  @Param('reportId') reportId: string,
  @Param('messageId') messageId: string,
  @Body('note') note: string,
) {
  return this.service.updateMessageNote(reportId, messageId, note);
}

// PATCH — aggiorna il contenuto (body) del messaggio
@Patch(':reportId/message/:messageId/body')
@ApiOperation({
  summary: 'Aggiorna il contenuto (body) di un messaggio',
  description: 'Permette ad admin o agent di modificare il testo visibile del messaggio.',
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
  @Param('reportId') reportId: string,
  @Param('messageId') messageId: string,
  @Body('body') body: string,
) {
  return this.service.updateMessageBody(reportId, messageId, body);
}

  // DELETE — ELIMINA UNA SEGNALAZIONE COMPLETA
  @Delete(':reportId')
  @ApiOperation({
    summary: 'Elimina una segnalazione',
    description: 'Rimuove la segnalazione e tutti i dati collegati (messaggi, utenti pubblici).',
  })
  deleteReport(@Param('reportId') reportId: string) {
    return this.service.deleteReport(reportId);
  }
}


 
