import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateReportMessageDto } from './dto/create-report-message.dto';
import { CreateReportStatusDto } from './dto/create-report-status.dto';
import * as crypto from 'crypto';
import { ReportStatus } from '../../generated/tenant';

// Helper locale: aggiunge giorni a una data
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaTenantService) {}

  private readonly STATUS_DURATIONS = {
    OPEN: 7,
    IN_PROGRESS: 14,
    CLOSED: 30,
  };

  /**
   * Crea una nuova segnalazione anonima
   */
  async createReport(dto: CreateReportDto) {
    const title = `${dto.clientId}: ${dto.tipoSegnalazione}, ${dto.ufficio}`;

    const tokenPlain = `${dto.clientId}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}`;
    const secretToken = crypto.createHash('sha256').update(tokenPlain).digest('hex');

    const report = await this.prisma.whistleReport.create({
      data: {
        clientId: dto.clientId,
        title,
        summary: dto.segnalazione,
        status: 'OPEN',
        channel: 'WEB',
        publicCode: `PUB-${Date.now()}`,
        secretHash: `SEC-${Date.now()}`,
        openAt: new Date(),
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
      message: 'Segnalazione creata con successo',
      reportId: report.id,
      tokenAccesso: tokenPlain,
      publicUserId: publicUser.id,
    };
  }

  /**
   * Recupera una segnalazione tramite token (public user)
   */
  async getReportByToken(tokenPlain: string) {
    const secretToken = crypto.createHash('sha256').update(tokenPlain).digest('hex');

    const user = await this.prisma.publicUser.findUnique({
      where: { token: secretToken },
      include: {
        report: {
          include: {
            messages: {
              select: {
                id: true,
                author: true,
                body: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Token non valido o segnalazione non trovata');

    return {
      message: 'Segnalazione trovata',
      report: user.report,
    };
  }

  /**
   * Elenco segnalazioni per cliente (solo admin/agent)
   */
  listReports(clientId: string) {
    return this.prisma.whistleReport.findMany({
      where: { clientId },
      include: {
        messages: {
          select: {
            id: true,
            author: true,
            body: true,
            note: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Aggiunge un messaggio a una segnalazione
   */
  addMessage(dto: CreateReportMessageDto) {
    return this.prisma.reportMessage.create({ data: dto });
  }

  /**
   * Elenco messaggi per una segnalazione
   */
  listMessages(reportId: string) {
    return this.prisma.reportMessage.findMany({
      where: { reportId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * PATCH — aggiorna lo stato della segnalazione
   */
  async updateStatus(reportId: string, dto: CreateReportStatusDto) {
    const report = await this.prisma.whistleReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Segnalazione non trovata');

    const now = new Date();
    const newStatus = dto.status as ReportStatus;

    if (report.status === ReportStatus.OPEN) {
      const limit = addDays(report.openAt ?? report.createdAt, this.STATUS_DURATIONS.OPEN);
      if (now > limit && newStatus !== ReportStatus.IN_PROGRESS) {
        throw new BadRequestException('Tempo massimo per passare da OPEN a IN_PROGRESS scaduto');
      }
    }

    if (report.status === ReportStatus.IN_PROGRESS) {
      const limit = addDays(report.inProgressAt ?? now, this.STATUS_DURATIONS.IN_PROGRESS);
      if (now > limit && newStatus !== ReportStatus.CLOSED) {
        throw new BadRequestException('Tempo massimo per chiudere il report scaduto');
      }
    }

    const data: any = { status: newStatus };
    if (newStatus === ReportStatus.OPEN) data.openAt = now;
    if (newStatus === ReportStatus.IN_PROGRESS) data.inProgressAt = now;
    if (newStatus === ReportStatus.CLOSED) data.finalClosedAt = now;

    await this.prisma.whistleReport.update({
      where: { id: reportId },
      data,
    });

    return { message: 'Stato segnalazione aggiornato con successo', newStatus };
  }

  /**
* PATCH — aggiorna la nota interna di un messaggio
* (solo admin/agent)
*/
async updateMessageNote(reportId: string, messageId: string, note: string) {
  const message = await this.prisma.reportMessage.findFirst({
    where: { id: messageId, reportId },
  });
  if (!message) throw new NotFoundException('Messaggio non trovato');

  const updatedMessage = await this.prisma.reportMessage.update({
    where: { id: messageId },
    data: { note },
  });

  return {
    message: 'Nota del messaggio aggiornata con successo',
    updatedMessage,
  };
}

/**
* PATCH — aggiorna il contenuto (body) del messaggio
* (solo admin/agent)
*/
async updateMessageBody(reportId: string, messageId: string, body: string) {
  const message = await this.prisma.reportMessage.findFirst({
    where: { id: messageId, reportId },
  });
  if (!message) throw new NotFoundException('Messaggio non trovato');

  const updatedMessage = await this.prisma.reportMessage.update({
    where: { id: messageId },
    data: { body },
  });

  return {
    message: 'Contenuto del messaggio aggiornato con successo',
    updatedMessage,
  };
}


  /**
   * DELETE — elimina una segnalazione
   */
  async deleteReport(reportId: string) {
    const report = await this.prisma.whistleReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Segnalazione non trovata');

    await this.prisma.reportMessage.deleteMany({ where: { reportId } });
    await this.prisma.publicUser.deleteMany({ where: { reportId } });
    await this.prisma.whistleReport.delete({ where: { id: reportId } });

    return { message: 'Segnalazione eliminata con successo', id: reportId };
  }
}



 