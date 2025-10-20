import { Injectable, NotFoundException, BadRequestException, PayloadTooLargeException, ForbiddenException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateReportMessageDto } from './dto/create-report-message.dto';
import { CreateReportStatusDto } from './dto/create-report-status.dto';
import * as crypto from 'crypto';
import { ReportStatus } from '../../generated/tenant';
import * as bcrypt from 'bcryptjs';
import { Request } from 'express';
import { RequestInfoDto } from './dto/request-info.dto';
import { VoiceTranscriptDto } from './dto/voice-transcript.dto';

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
   * Crea una nuova segnalazione (TENANT/backoffice) con payload unificato.
   */
  async createReportInternal(req: Request, body: any) {
    const user = (req as any).user || {};
    const tenantId = user.clientId as string;
    if (!tenantId) throw new BadRequestException('Tenant non valido');

    // Normalizzazione payload: nuovo schema o legacy
    const subject = (body?.subject as string) || [body?.tipoSegnalazione, body?.ufficio].filter(Boolean).join(' - ');
    const description = (body?.description as string) || (body?.segnalazione as string);
    const date = (body?.date as string) || new Date().toISOString();
    const source = (body?.source as string) || (body?.channel as string) || 'WEB';
    const privacy = ((body?.privacy as string) || 'ANONIMO').toUpperCase();
    const departmentId = body?.departmentId as string | undefined;
    const categoryId = body?.categoryId as string | undefined;
    const attachments = Array.isArray(body?.attachments) ? body.attachments : [];

    if (!subject || subject.length < 3 || subject.length > 200) {
      throw new BadRequestException('Oggetto non valido');
    }
    if (!description || description.length < 10 || description.length > 10000) {
      throw new BadRequestException('Descrizione non valida');
    }
    if (!departmentId || !categoryId) {
      throw new BadRequestException('departmentId e categoryId sono obbligatori');
    }

    // Scoping forte: department/category appartengono al tenant e si relazionano correttamente
    const dep = await this.prisma.department.findFirst({ where: { id: departmentId, clientId: tenantId, active: true }, select: { id: true } });
    if (!dep) throw new NotFoundException('Risorsa non trovata');
    const cat = await this.prisma.category.findFirst({ where: { id: categoryId, clientId: tenantId, departmentId, active: true }, select: { id: true } });
    if (!cat) throw new NotFoundException('Risorsa non trovata');

    // Allegati policy (identica al public)
    const presignEnabled = (process.env.PRESIGN_ENABLED || '').toLowerCase() === 'true' || process.env.PRESIGN_ENABLED === '1';
    const toBytes = (mb: number) => Math.floor(mb * 1024 * 1024);
    const maxFiles = parseInt(process.env.ATTACH_MAX_FILES || '3', 10);
    const maxFileBytes = toBytes(parseInt(process.env.ATTACH_MAX_FILE_MB || '10', 10));
    const maxTotalBytes = toBytes(parseInt(process.env.ATTACH_MAX_TOTAL_MB || '20', 10));
    const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'application/pdf', 'text/plain']);
    const EXT_FOR_MIME: Record<string, string[]> = {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
    };
    const getExt = (name: string) => {
      const i = name.lastIndexOf('.');
      return i >= 0 ? name.substring(i).toLowerCase() : '';
    };

    if (attachments.length > 0 && !presignEnabled) {
      throw new BadRequestException('Allegati non consentiti');
    }
    if (attachments.length > maxFiles) throw new PayloadTooLargeException('Troppe parti allegate');
    let total = 0;
    for (const a of attachments) {
      if (!ALLOWED_MIME.has(a.mimeType)) throw new BadRequestException('Tipo file non consentito');
      const ext = getExt(a.fileName);
      const allowedExt = EXT_FOR_MIME[a.mimeType] || [];
      if (!allowedExt.includes(ext)) throw new BadRequestException('Estensione incoerente con MIME');
      if (!a.storageKey || !a.storageKey.startsWith(`${tenantId}/`)) throw new BadRequestException('storageKey non valido');
      if (a.sizeBytes > maxFileBytes) throw new PayloadTooLargeException('File oltre il limite');
      total += a.sizeBytes || 0;
      if (total > maxTotalBytes) throw new PayloadTooLargeException('Dimensione totale oltre il limite');
    }

    // Helper
    const mapSource = (src: string): 'WEB' | 'PHONE' | 'EMAIL' | 'OTHER' => {
      const s = (src || '').toUpperCase();
      if (s === 'ALTRO') return 'OTHER';
      if (s === 'WEB' || s === 'PHONE' || s === 'EMAIL' || s === 'OTHER') return s as any;
      return 'OTHER';
    };
    const base64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const hmacSha256Hex = (key: string, data: string) => crypto.createHmac('sha256', key).update(data).digest('hex');
    const detectPii = (text: string) => {
      if (!text) return false;
      const email = /\b[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
      const phone = /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/;
      return email.test(text) || phone.test(text);
    };
    const normalizeCode = () => {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const pick = (n: number) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      return `R-${pick(4)}-${pick(4)}`.toUpperCase();
    };

    const now = new Date();
    const eventDate = new Date(date);
    const channel = mapSource(source);
    const piiEnabled = (process.env.PII_CHECK_ENABLED || '').toLowerCase() === 'true' || process.env.PII_CHECK_ENABLED === '1';
    const containsPII = piiEnabled && (detectPii(subject) || detectPii(description));

    const secretRaw = base64url(crypto.randomBytes(32));
    const pepper = process.env.REPORT_SECRET_PEPPER || 'dev_report_pepper';
    const cost = parseInt(process.env.REPORT_SECRET_COST || '12', 10);
    const secretHash = await bcrypt.hash(secretRaw + pepper, cost);
    const tokenSha = crypto.createHash('sha256').update(secretRaw).digest('hex');

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.socket?.remoteAddress || '');
    const ipPepper = process.env.IP_HASH_PEPPER || 'dev_ip_pepper';
    const ipHash = ip ? hmacSha256Hex(ipPepper, ip) : undefined;
    const ua = (req.headers['user-agent'] as string) || undefined;

    let report: any;
    let publicCode = '';
    for (let i = 0; i < 5; i++) {
      try {
        publicCode = normalizeCode();
        report = await this.prisma.$transaction(async (tx) => {
          const r = await tx.whistleReport.create({
            data: {
              clientId: tenantId,
              publicCode,
              secretHash,
              status: 'OPEN' as any,
              title: subject,
              summary: description,
              createdAt: now,
              channel: channel as any,
              eventDate,
              privacy: privacy as any,
              departmentId,
              categoryId,
              containsPIISuspected: !!containsPII,
              ipHash,
              ua,
            },
          });
          await tx.publicUser.create({ data: { clientId: tenantId, token: tokenSha, reportId: r.id } });
          if (attachments.length > 0) {
            await tx.reportAttachment.createMany({
              data: attachments.map((a: any) => ({
                reportId: r.id,
                fileName: a.fileName,
                mimeType: a.mimeType,
                sizeBytes: a.sizeBytes,
                storageKey: a.storageKey,
              })),
            });
          }
          return r;
        });
        break;
      } catch (e: any) {
        const code = e?.code || e?.meta?.code;
        const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : e?.meta?.target;
        if (code === 'P2002' && (target?.includes('publicCode') || true)) continue;
        throw e;
      }
    }
    if (!report) throw new BadRequestException('Impossibile creare la segnalazione, riprovare');

    return { reportId: report.id, publicCode: publicCode.toUpperCase(), secret: secretRaw, createdAt: report.createdAt };
  }

  /**
   * Recupera una segnalazione tramite token (public user)
   */
  async getReportByToken(tokenPlain: string) {
    const secretToken = crypto.createHash('sha256').update(tokenPlain).digest('hex');

    const user = await this.prisma.publicUser.findUnique({
      where: { token: secretToken },
      select: {
        report: {
          select: {
            id: true,
            publicCode: true,
            status: true,
            title: true,
            summary: true,
            createdAt: true,
            updatedAt: true,
            eventDate: true,
            privacy: true,
            channel: true,
            messages: {
              where: { visibility: 'PUBLIC' as any },
              select: { id: true, author: true, body: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!user || !user.report) throw new NotFoundException('Token non valido o segnalazione non trovata');

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
   * TENANT: aggiunge nota (INTERNAL) o messaggio (PUBLIC) al report
   */
  async addTenantMessage(req: any, dto: { reportId: string; body: string; visibility?: string }) {
    const tenantId = req?.user?.clientId as string | undefined;
    const userId = req?.user?.sub as string | undefined;
    if (!tenantId || !userId) throw new BadRequestException('Tenant non valido');

    // Scoping report
    const report = await this.prisma.whistleReport.findFirst({ where: { id: dto.reportId, clientId: tenantId }, select: { id: true } });
    if (!report) throw new NotFoundException('Risorsa non trovata');

    const vis = ((dto.visibility || 'INTERNAL').toUpperCase()) as 'PUBLIC' | 'INTERNAL';
    if (vis !== 'PUBLIC' && vis !== 'INTERNAL') {
      throw new BadRequestException('Visibility non valida');
    }

    const authorDisplay = vis === 'PUBLIC' ? 'AGENTE' : (req?.user?.email || 'AGENTE');

    const message = await this.prisma.reportMessage.create({
      data: {
        clientId: tenantId,
        reportId: dto.reportId,
        author: authorDisplay,
        authorId: userId,
        body: dto.body,
        visibility: vis as any,
      },
    });

    return { message: 'Messaggio aggiunto con successo', item: message };
  }

  /**
   * TENANT: lista messaggi con filtro visibility
   */
  async listMessagesTenant(req: any, reportId: string, visibility?: string) {
    const tenantId = req?.user?.clientId as string | undefined;
    if (!tenantId) throw new BadRequestException('Tenant non valido');

    // Scoping report
    const report = await this.prisma.whistleReport.findFirst({ where: { id: reportId, clientId: tenantId }, select: { id: true } });
    if (!report) throw new NotFoundException('Risorsa non trovata');

    let filter: any = { reportId, clientId: tenantId };
    if (visibility && visibility.toUpperCase() !== 'ALL') {
      const parts = visibility.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      const allowed = ['PUBLIC', 'INTERNAL', 'SYSTEM'];
      const selected = parts.filter((p) => allowed.includes(p));
      if (selected.length > 0) filter.visibility = { in: selected as any };
    }

    return this.prisma.reportMessage.findMany({ where: filter, orderBy: { createdAt: 'asc' } });
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

    // Scrivi storico cambi di stato (audit)
    await this.prisma.reportStatusHistory.create({
      data: {
        clientId: report.clientId,
        reportId: report.id,
        note: dto.note ?? undefined,
        author: dto.author ?? undefined,
        agentId: dto.agentId ?? undefined,
        status: newStatus,
      },
    });
    
    // Se NEED_INFO, crea messaggio di sistema con richiesta chiarimenti
    if ((dto.status || '').toUpperCase() === 'NEED_INFO') {
      const defaultBody = 'Richiesta di informazioni aggiuntive da parte del team. Per favore fornisci i dettagli mancanti utili alla gestione.';
      const body = dto.note ? `${defaultBody}\n\nDettagli: ${dto.note}` : defaultBody;
      await this.prisma.reportMessage.create({
        data: {
          clientId: report.clientId,
          reportId: report.id,
          author: dto.author || 'system',
          body,
          note: undefined,
          visibility: 'SYSTEM' as any,
        },
      });
    }

    return { message: 'Stato segnalazione aggiornato con successo', newStatus };
  }

  /**
* PATCH — aggiorna la nota interna di un messaggio
* (solo admin/agent)
*/
async updateMessageNoteTenant(req: any, reportId: string, messageId: string, note: string) {
  const tenantId = req?.user?.clientId as string | undefined;
  if (!tenantId) throw new BadRequestException('Tenant non valido');
  const message = await this.prisma.reportMessage.findFirst({ where: { id: messageId, reportId, clientId: tenantId } });
  if (!message) throw new NotFoundException('Messaggio non trovato');
  if ((message as any).visibility !== 'INTERNAL') throw new ForbiddenException('Non è consentito modificare questo messaggio');

  const updatedMessage = await this.prisma.reportMessage.update({ where: { id: messageId }, data: { note } });
  return { message: 'Nota del messaggio aggiornata con successo', updatedMessage };
}

/**
* PATCH — aggiorna il contenuto (body) del messaggio
* (solo admin/agent)
*/
async updateMessageBodyTenant(req: any, reportId: string, messageId: string, body: string) {
  const tenantId = req?.user?.clientId as string | undefined;
  if (!tenantId) throw new BadRequestException('Tenant non valido');
  const message = await this.prisma.reportMessage.findFirst({ where: { id: messageId, reportId, clientId: tenantId } });
  if (!message) throw new NotFoundException('Messaggio non trovato');
  if ((message as any).visibility !== 'INTERNAL') throw new ForbiddenException('Non è consentito modificare questo messaggio');

  const updatedMessage = await this.prisma.reportMessage.update({ where: { id: messageId }, data: { body } });
  return { message: 'Contenuto del messaggio aggiornato con successo', updatedMessage };
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

  /**
   * TENANT: Richiesta chiarimenti (NEED_INFO + messaggio PUBLIC)
   */
  async requestInfo(req: any, reportId: string, dto: RequestInfoDto) {
    const tenantId = req?.user?.clientId as string | undefined;
    const userId = req?.user?.sub as string | undefined;
    const authorEmail = req?.user?.email as string | undefined;
    if (!tenantId || !userId) throw new BadRequestException('Tenant non valido');

    const report = await this.prisma.whistleReport.findFirst({ where: { id: reportId, clientId: tenantId } });
    if (!report) throw new NotFoundException('Segnalazione non trovata');

    // Aggiorna stato a NEED_INFO (crea anche messaggio SYSTEM via updateStatus)
    await this.updateStatus(reportId, {
      clientId: tenantId,
      reportId,
      status: 'NEED_INFO' as any,
      note: dto.note,
      author: authorEmail || 'system',
      agentId: userId,
    } as any);

    // Messaggio pubblico al segnalante
    const pub = await this.prisma.reportMessage.create({
      data: {
        clientId: tenantId,
        reportId,
        author: 'AGENTE',
        authorId: userId,
        body: dto.message,
        visibility: 'PUBLIC' as any,
      },
    });

    return { message: 'Richiesta chiarimenti inviata', status: 'NEED_INFO', publicMessageId: pub.id };
  }

  /**
   * TENANT: aggiunge una trascrizione (nota INTERNAL)
   */
  async addVoiceTranscript(req: any, reportId: string, dto: VoiceTranscriptDto) {
    const tenantId = req?.user?.clientId as string | undefined;
    const userId = req?.user?.sub as string | undefined;
    const authorEmail = req?.user?.email as string | undefined;
    if (!tenantId || !userId) throw new BadRequestException('Tenant non valido');

    const report = await this.prisma.whistleReport.findFirst({ where: { id: reportId, clientId: tenantId } });
    if (!report) throw new NotFoundException('Segnalazione non trovata');

    const msg = await this.prisma.reportMessage.create({
      data: {
        clientId: tenantId,
        reportId,
        author: authorEmail || 'AGENTE',
        authorId: userId,
        body: dto.transcript,
        visibility: 'INTERNAL' as any,
        note: 'Trascrizione audio',
      },
    });

    return { message: 'Trascrizione aggiunta', item: msg };
  }
}



 
