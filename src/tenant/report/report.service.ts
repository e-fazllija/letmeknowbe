// import { Injectable } from '@nestjs/common';
// import { PrismaTenantService } from '../prisma-tenant.service';
// import { CreateReportDto } from './dto/create-report.dto';
// import { CreateReportMessageDto } from './dto/create-report-message.dto';
// import { CreateReportStatusDto } from './dto/create-report-status.dto';
// import * as crypto from 'crypto';

// @Injectable()
// export class ReportService {
//   constructor(private prisma: PrismaTenantService) {}

//   // Creazione nuova segnalazione + utente pubblico
//   async createReport(dto: CreateReportDto) {
//     // genera titolo automatico
//     const title = `${dto.clientId}: ${dto.tipoSegnalazione}, ${dto.ufficio}`;

//     // genera token univoco e cifrato
//     const tokenPlain = `${dto.clientId}-${Date.now()}-${Math.random()
//       .toString(36)
//       .substring(2, 15)}`;
//     const secretToken = crypto
//       .createHash('sha256')
//       .update(tokenPlain)
//       .digest('hex');

//     // crea la segnalazione nel DB
//     const report = await this.prisma.whistleReport.create({
//       data: {
//         clientId: dto.clientId,
//         title,
//         summary: dto.segnalazione,
//         status: 'OPEN',
//         channel: 'WEB',
//         publicCode: `PUB-${Date.now()}`,
//         secretHash: `SEC-${Date.now()}`,
//       },
//     });

//     // collega l’utente pubblico alla segnalazione
//     const publicUser = await this.prisma.publicUser.create({
//       data: {
//         clientId: dto.clientId,
//         token: secretToken,
//         reportId: report.id,
//       },
//     });

//     return {
//       message: 'Segnalazione creata con successo',
//       reportId: report.id,
//       tokenAccesso: tokenPlain, // questo lo mostri solo una volta!
//       publicUserId: publicUser.id,
//     };
//   }

//   //Elenco segnalazioni per cliente
//   listReports(clientId: string) {
//     return this.prisma.whistleReport.findMany({
//       where: { clientId },
//       include: { messages: true, statusLogs: true },
//     });
//   }

//   // Aggiungi messaggio
//   addMessage(dto: CreateReportMessageDto) {
//     return this.prisma.reportMessage.create({ data: dto });
//   }

//   // Lista messaggi di una segnalazione
//   listMessages(reportId: string) {
//     return this.prisma.reportMessage.findMany({ where: { reportId } });
//   }

//   // Aggiungi stato
//   addStatus(dto: CreateReportStatusDto) {
//     return this.prisma.reportStatusHistory.create({ data: dto });
//   }

//   // Lista stati di una segnalazione
//   listStatus(reportId: string) {
//     return this.prisma.reportStatusHistory.findMany({ where: { reportId } });
//   }
// }

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateReportMessageDto } from './dto/create-report-message.dto';
import { CreateReportStatusDto } from './dto/create-report-status.dto';
import * as crypto from 'crypto';

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaTenantService) {}

  /**
   * 🧾 Crea una nuova segnalazione anonima
   * - genera titolo automatico
   * - crea record in `WhistleReport`
   * - registra un utente pubblico con token cifrato
   * - restituisce token leggibile solo al segnalante
   */
  async createReport(dto: CreateReportDto) {
    const title = `${dto.clientId}: ${dto.tipoSegnalazione}, ${dto.ufficio}`;

    const tokenPlain = `${dto.clientId}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}`;
    const secretToken = crypto
      .createHash('sha256')
      .update(tokenPlain)
      .digest('hex');

    const report = await this.prisma.whistleReport.create({
      data: {
        clientId: dto.clientId,
        title,
        summary: dto.segnalazione,
        status: 'OPEN',
        channel: 'WEB',
        publicCode: `PUB-${Date.now()}`,
        secretHash: `SEC-${Date.now()}`,
      },
    });

    const publicUser = await this.prisma.publicUser.create({
      data: {
        clientId: dto.clientId,
        token: secretToken,
        reportId: report.id,
      },
    });

    return {
      message: '✅ Segnalazione creata con successo',
      reportId: report.id,
      tokenAccesso: tokenPlain,
      publicUserId: publicUser.id,
    };
  }

  /**
   * 🔍 Recupera una segnalazione tramite token
   */
  async getReportByToken(tokenPlain: string) {
    const secretToken = crypto
      .createHash('sha256')
      .update(tokenPlain)
      .digest('hex');

    const user = await this.prisma.publicUser.findUnique({
      where: { token: secretToken },
      include: {
        report: {
          include: { messages: true, statusLogs: true },
        },
      },
    });

    if (!user) throw new NotFoundException('Token non valido o segnalazione non trovata');

    return {
      message: '✅ Segnalazione trovata',
      report: user.report,
    };
  }

  /**
   * 📋 Elenco segnalazioni per cliente (solo admin/agent)
   */
  listReports(clientId: string) {
    return this.prisma.whistleReport.findMany({
      where: { clientId },
      include: { messages: true, statusLogs: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 💬 Aggiunge un messaggio a una segnalazione
   */
  addMessage(dto: CreateReportMessageDto) {
    return this.prisma.reportMessage.create({ data: dto });
  }

  /**
   * 📨 Elenco messaggi per una segnalazione
   */
  listMessages(reportId: string) {
    return this.prisma.reportMessage.findMany({
      where: { reportId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 🔄 PATCH — aggiorna stato segnalazione
   * (usata da admin o agent)
   */
  async updateStatus(reportId: string, dto: CreateReportStatusDto) {
    const exists = await this.prisma.whistleReport.findUnique({ where: { id: reportId } });
    if (!exists) throw new NotFoundException('Segnalazione non trovata');

    // Aggiorna il record principale
    await this.prisma.whistleReport.update({
      where: { id: reportId },
      data: { status: dto.status },
    });

    // Registra nello storico
    await this.prisma.reportStatusHistory.create({
      data: {
        clientId: dto.clientId,
        reportId,
        note: dto.note ?? null,
        author: dto.author ?? 'SYSTEM',
        status: dto.status,
      },
    });

    return { message: '✅ Stato segnalazione aggiornato con successo' };
  }

  /**
   * 🗑️ DELETE — elimina completamente una segnalazione
   * (inclusi messaggi, storico e utente pubblico)
   */
  async deleteReport(reportId: string) {
    const report = await this.prisma.whistleReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Segnalazione non trovata');

    // Rimozione in ordine logico per evitare FK errors
    await this.prisma.reportMessage.deleteMany({ where: { reportId } });
    await this.prisma.reportStatusHistory.deleteMany({ where: { reportId } });
    await this.prisma.publicUser.deleteMany({ where: { reportId } });
    await this.prisma.whistleReport.delete({ where: { id: reportId } });

    return { message: '🗑️ Segnalazione eliminata con successo', id: reportId };
  }

  /**
   * 🕓 Elenco storico stati per una segnalazione
   */
  listStatus(reportId: string) {
    return this.prisma.reportStatusHistory.findMany({
      where: { reportId },
      orderBy: { modifiedAt: 'desc' },
    });
  }
}
