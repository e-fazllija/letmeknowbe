// import { Body, Controller, Get, Param, Post } from '@nestjs/common';
// import { ApiTags, ApiOperation } from '@nestjs/swagger';
// import { ReportService } from './report.service';
// import { CreateReportDto } from './dto/create-report.dto';
// import { CreateReportMessageDto } from './dto/create-report-message.dto';
// import { CreateReportStatusDto } from './dto/create-report-status.dto';

// @ApiTags('tenant-reports')
// @Controller('tenant/reports')
// export class ReportController {
//   constructor(private service: ReportService) {}

//   @Post()
//   @ApiOperation({ summary: 'Crea il report con reportid nella tabella WhistleReport' })
//   createReport(@Body() dto: CreateReportDto) {
//     return this.service.createReport(dto);
//   }

//   @Get(':tenantId')
//   @ApiOperation({ summary: 'Ritorna tutti i report nella tabella WhistleReport' })
//   listReports(@Param('tenantId') tenantId: string) {
//     return this.service.listReports(tenantId);
//   }

//   @Post('message')
//   @ApiOperation({ summary: 'Crea il reportMessage con il relativo id nella tabella MessageReport' })
//   addMessage(@Body() dto: CreateReportMessageDto) {
//     return this.service.addMessage(dto);
//   }

//   @Get('messages/:reportId')
//   @ApiOperation({ summary: 'Ritorna il reportMessage tramite reportid dalla tabella MessageReport' })
//   listMessages(@Param('reportId') reportId: string) {
//     return this.service.listMessages(reportId);
//   }

//   @Post('status')
//   @ApiOperation({ summary: 'Crea lo statushistory con relativo id nella tabella ReportStatusHistory' })
//   addStatus(@Body() dto: CreateReportStatusDto) {
//     return this.service.addStatus(dto);
//   }

//   @Get('status/:reportId')
//   @ApiOperation({ summary: 'Ritorna lo status del report tramite reportid dalla tabella ReportStatusHistory' })
//   listStatus(@Param('reportId') reportId: string) {
//     return this.service.listStatus(reportId);
//   }
// }
 
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
import { ApiOperation, ApiTags, ApiQuery, ApiParam } from '@nestjs/swagger';

@ApiTags('Tenant - Segnalazioni')
@Controller('v1/tenant/reports')
export class ReportController {
  constructor(private readonly service: ReportService) {}

  // 🧾 CREA NUOVA SEGNALAZIONE ANONIMA
  @Post()
  @ApiOperation({
    summary: 'Crea una nuova segnalazione anonima',
    description:
      'Crea una segnalazione per un’azienda specifica, genera automaticamente titolo e token di accesso.',
  })
  createReport(@Body() dto: CreateReportDto) {
    return this.service.createReport(dto);
  }

  // 🔍 RECUPERA UNA SEGNALAZIONE TRAMITE TOKEN
  @Get('token/:token')
  @ApiOperation({
    summary: 'Recupera una segnalazione tramite token',
    description:
      'Permette a un utente anonimo di recuperare la propria segnalazione usando il token fornito al momento della creazione.',
  })
  @ApiParam({ name: 'token', description: 'Token fornito al segnalante' })
  getByToken(@Param('token') token: string) {
    return this.service.getReportByToken(token);
  }

  // 📋 ELENCO SEGNALAZIONI PER CLIENT (ADMIN/AGENT)
  @Get()
  @ApiOperation({
    summary: 'Elenco segnalazioni per cliente',
    description: 'Restituisce tutte le segnalazioni associate a un determinato clientId.',
  })
  @ApiQuery({ name: 'clientId', required: true, description: 'ID del cliente' })
  listReports(@Query('clientId') clientId: string) {
    return this.service.listReports(clientId);
  }

  // 💬 AGGIUNGI MESSAGGIO A UNA SEGNALAZIONE
  @Post('message')
  @ApiOperation({
    summary: 'Aggiunge un messaggio a una segnalazione',
    description: 'Permette ad admin o agent di aggiungere un messaggio di aggiornamento o risposta.',
  })
  addMessage(@Body() dto: CreateReportMessageDto) {
    return this.service.addMessage(dto);
  }

  // 📨 ELENCO MESSAGGI DI UNA SEGNALAZIONE
  @Get(':reportId/messages')
  @ApiOperation({
    summary: 'Elenco messaggi di una segnalazione',
    description: 'Restituisce tutti i messaggi legati a una specifica segnalazione.',
  })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  listMessages(@Param('reportId') reportId: string) {
    return this.service.listMessages(reportId);
  }

  // 🔄 PATCH — AGGIORNA STATO DELLA SEGNALAZIONE
  @Patch(':reportId/status')
  @ApiOperation({
    summary: 'Aggiorna lo stato della segnalazione',
    description: 'Aggiorna lo stato di una segnalazione (es. OPEN → IN_PROGRESS → CLOSED) e registra lo storico.',
  })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  updateStatus(@Param('reportId') reportId: string, @Body() dto: CreateReportStatusDto) {
    return this.service.updateStatus(reportId, dto);
  }

  // 🗑️ DELETE — ELIMINA COMPLETAMENTE UNA SEGNALAZIONE
  @Delete(':reportId')
  @ApiOperation({
    summary: 'Elimina una segnalazione',
    description: 'Rimuove una segnalazione dal database, insieme a messaggi, storico e utente pubblico collegato.',
  })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione da cancellare' })
  deleteReport(@Param('reportId') reportId: string) {
    return this.service.deleteReport(reportId);
  }

  // 🕓 LISTA STORICO STATI
  @Get(':reportId/status')
  @ApiOperation({
    summary: 'Elenco storico stati della segnalazione',
    description: 'Restituisce la cronologia dei cambi di stato della segnalazione.',
  })
  @ApiParam({ name: 'reportId', description: 'ID della segnalazione' })
  listStatus(@Param('reportId') reportId: string) {
    return this.service.listStatus(reportId);
  }
}
