import { Injectable, NotFoundException, BadRequestException, PayloadTooLargeException, ForbiddenException, NotImplementedException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateReportMessageDto } from './dto/create-report-message.dto';
import { CreateReportStatusDto } from './dto/create-report-status.dto';
import * as crypto from 'crypto';
import { ReportStatus } from '../../generated/tenant';
import * as bcrypt from 'bcryptjs';
import { Request } from 'express';
import { RequestInfoDto } from './dto/request-info.dto';
import { VoiceTranscriptDto } from './dto/voice-transcript.dto';
import { decryptPII, encryptPII, parseKeyFromEnv } from '../../common/security/pii-crypto';

// Helper locale: aggiunge giorni a una data
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaTenantService, private notify: NotificationsService) {}

  private readonly STATUS_DURATIONS = {
    OPEN: 7,
    IN_PROGRESS: 14,
    CLOSED: 30,
  };

  /**
   * Dettaglio report con auto-ack alla prima lettura (idempotente)
   */
  async getDetailAndAck(req: any, reportId: string) {
    const tenantId = req?.user?.clientId as string | undefined;
    if (!tenantId) throw new BadRequestException('Tenant non valido');
    const userId = req?.user?.sub as string | undefined;
    const userRole = ((req?.user?.role as string) || 'ADMIN').toUpperCase();

    let report = await this.prisma.whistleReport.findFirst({
      where: { id: reportId, clientId: tenantId },
      include: {
        messages: {
          select: { id: true, author: true, body: true, note: true, createdAt: true, visibility: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!report) throw new NotFoundException('Segnalazione non trovata');

    // Visibilità: se assegnato ad altri e l'utente non ha canViewAllCases, blocca
    if (report.internalUserId && userId && report.internalUserId !== userId) {
      const viewer = await this.prisma.internalUser.findUnique({ where: { id: userId }, select: { canViewAllCases: true } });
      if (!viewer?.canViewAllCases) {
        // privacy hardening: non rivelare l'esistenza
        throw new NotFoundException('Segnalazione non trovata');
      }
    }

    // Auto-claim FIRST_VIEW: se unassigned, assegna al primo che apre (ADMIN/AGENT)
    const mode = (process.env.AUTO_ASSIGN_MODE || 'FIRST_VIEW').toUpperCase();
    const eligible = userId && (userRole === 'ADMIN' || userRole === 'AGENT');
    const requireActive = this.isTrue(process.env.CLAIM_REQUIRE_ACTIVE || 'true');
    let canClaim = !!eligible;
    if (canClaim && requireActive && userId) {
      try {
        const u = await this.prisma.internalUser.findUnique({ where: { id: userId }, select: { status: true } });
        canClaim = ((u as any)?.status || 'ACTIVE') === 'ACTIVE';
      } catch { canClaim = false; }
    }
    if (mode === 'FIRST_VIEW' && canClaim && !report.internalUserId) {
      const now = new Date();
      const updated = await this.prisma.whistleReport.updateMany({
        where: { id: reportId, clientId: tenantId, internalUserId: null },
        data: { internalUserId: userId, assignedAt: now },
      });
      if (updated.count === 1) {
        // Audit message SYSTEM
        await this.prisma.reportMessage.create({
          data: {
            clientId: tenantId,
            reportId,
            author: 'system',
            body: 'Caso assegnato automaticamente al primo visualizzatore.',
            note: 'CASE_ASSIGNED',
            visibility: 'SYSTEM' as any,
          },
        });
        // ricarica snapshot assegnato
        report = await this.prisma.whistleReport.findFirst({
          where: { id: reportId, clientId: tenantId },
          include: {
            messages: {
              select: { id: true, author: true, body: true, note: true, createdAt: true, visibility: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      }
    }

    // Type guard post-refresh
    if (!report) throw new NotFoundException('Segnalazione non trovata');
    const current = report; // non-null
    if (!current.acknowledgeAt) {
      const now = new Date();
      const responseDays = parseInt(process.env.RESPONSE_TTL_DAYS || '90', 10);
      const dueAt = addDays(now, isNaN(responseDays) ? 90 : responseDays);
      const repId = current.id;
      const repClientId = current.clientId;
      await this.prisma.$transaction(async (tx) => {
        await tx.whistleReport.update({ where: { id: repId }, data: { acknowledgeAt: now, dueAt } });
        await tx.reportMessage.create({
          data: {
            clientId: repClientId,
            reportId: repId,
            author: 'system',
            body: 'Segnalazione presa in carico (visualizzata).',
            note: 'SLA_ACK_ON_VIEW',
            visibility: 'SYSTEM' as any,
          },
        });
      });
      // eslint-disable-next-line no-console
      console.info('report acknowledged on view', { reportId });
      // refresh snapshot
      report = await this.prisma.whistleReport.findFirst({
        where: { id: repId, clientId: tenantId },
        include: {
          messages: {
            select: { id: true, author: true, body: true, note: true, createdAt: true, visibility: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    }

    // Access log (VIEW)
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.socket?.remoteAddress || '');
      const ua = (req.headers['user-agent'] as string) || undefined;
      const userId = req?.user?.sub as string | undefined;
      if (userId) {
        await (this.prisma as any).reportAccessLog.create({ data: { reportId, userId, clientId: tenantId, action: 'VIEW', ip: ip || undefined, ua } });
      }
    } catch {}
    // Decrypt reporterName for backoffice and avoid leaking encrypted blob
    try {
      const enc = (report as any)?.reporterNameEnc as string | undefined;
      if (enc) {
        const key = parseKeyFromEnv('REPORTER_DATA_ENC_KEY');
        const repId = ((report as any)?.id as string) || '';
        const name = decryptPII(enc, key, `${tenantId}:${repId}`);
        const out: any = { ...(report as any), reporterName: name };
        delete out.reporterNameEnc;
        return out;
      }
    } catch {}
    const out: any = { ...(report as any) };
    delete out.reporterNameEnc;
    return out;
  }

  /**
   * Crea una nuova segnalazione (TENANT/backoffice) con payload unificato.
   */
  async createReportInternal(req: Request, body: any) {
    const user = (req as any).user || {};
    const tenantId = user.clientId as string;
    const userId = user.sub as string | undefined;
    if (!tenantId) throw new BadRequestException('Tenant non valido');

    // Normalizzazione payload: nuovo schema o legacy
    const subject = (body?.subject as string) || [body?.tipoSegnalazione, body?.ufficio].filter(Boolean).join(' - ');
    const description = (body?.description as string) || (body?.segnalazione as string);
    const date = (body?.date as string) || new Date().toISOString();
    const source = (body?.source as string) || (body?.channel as string) || 'WEB';
    const privacy = ((body?.privacy as string) || 'ANONIMO').toUpperCase();
    const reporterNameRaw = body?.reporterName ? String(body.reporterName).trim() : '';
    if (privacy === 'ANONIMO' && reporterNameRaw) {
      throw new BadRequestException('Nominativo non consentito per segnalazione anonima');
    }
    if (privacy === 'CONFIDENZIALE' && !reporterNameRaw) {
      throw new BadRequestException('Nominativo obbligatorio per segnalazione confidenziale');
    }
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
    const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'application/pdf', 'text/plain', 'audio/mpeg', 'audio/wav']);
    const EXT_FOR_MIME: Record<string, string[]> = {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
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
    const retentionDaysEnv = parseInt(process.env.DATA_RETENTION_DAYS || '', 10);
    const yearsEnv = parseInt(process.env.DATA_RETENTION_YEARS || '5', 10);
    const retentionDays = !isNaN(retentionDaysEnv) && retentionDaysEnv > 0 ? retentionDaysEnv : ((isNaN(yearsEnv) || yearsEnv <= 0 ? 5 : yearsEnv) * 365);
    const retentionAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);
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
              retentionAt,
              channel: channel as any,
              eventDate,
              privacy: privacy as any,
              departmentId,
              categoryId,
              containsPIISuspected: !!containsPII,
              ipHash,
              ua,
              // Auto-assign al creatore backoffice (se presente)
              internalUserId: userId || null,
              assignedAt: userId ? now : null,
              acknowledgeAt: now,
            },
          });
          if (privacy === 'CONFIDENZIALE' && reporterNameRaw) {
            let key: Buffer;
            try { key = parseKeyFromEnv('REPORTER_DATA_ENC_KEY'); } catch { throw new InternalServerErrorException('Configurazione cifratura mancante'); }
            const enc = encryptPII(reporterNameRaw, key, `${tenantId}:${r.id}`);
            await tx.whistleReport.update({ where: { id: r.id }, data: { reporterNameEnc: enc } });
          }
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
          // Audit: se assegnato al creatore, aggiungi SYSTEM note
          if (userId) {
            await tx.reportMessage.create({
              data: {
                clientId: tenantId,
                reportId: r.id,
                author: 'system',
                body: 'Caso assegnato al creatore (backoffice).',
                note: 'CASE_ASSIGNED',
                visibility: 'SYSTEM' as any,
              },
            });
          }
          return r;
        });
        break;
      } catch (e: any) {
        const code = e?.code || e?.meta?.code;
        const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : e?.meta?.target;
        if (code === 'P2002' && target?.includes('publicCode')) continue;
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
  listReports(req: any, clientId: string, opts?: { page?: number; pageSize?: number; status?: string; departmentId?: string; categoryId?: string; q?: string }) {
    const page = Math.max(opts?.page || 1, 1);
    const pageSize = Math.min(Math.max(opts?.pageSize || 20, 1), 100);
    const skip = (page - 1) * pageSize;
    const where: any = { clientId };
    if (opts?.status) {
      const parts = opts.status.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (parts.length > 0) where.status = { in: parts as any };
    }
    if (opts?.departmentId) where.departmentId = opts.departmentId;
    if (opts?.categoryId) where.categoryId = opts.categoryId;
    if (opts?.q) {
      const q = opts.q.trim();
      if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }];
    }
    // Visibilità: AGENT senza canViewAllCases vede solo propri o unassigned
    const userId = req?.user?.sub as string | undefined;
    const userRole = ((req?.user?.role as string) || 'ADMIN').toUpperCase();
    const tenant = req?.user?.clientId as string | undefined;
    const canViewAll = (userId && tenant) ? this.canViewAllSync(tenant, userId) : true;

    if (userRole === 'AGENT' && !canViewAll && userId) {
      where.OR = [{ internalUserId: userId }, { internalUserId: null }];
    }

    return this.prisma.whistleReport.findMany({
      where,
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
      skip,
      take: pageSize,
    });
  }

  // Sync helper: best-effort read of canViewAllCases (avoid second query path complexities here)
  private canViewAllCache = new Map<string, { v: boolean; t: number }>();
  private canViewAllSync(tenantId: string, userId: string): boolean {
    const key = `${tenantId}:${userId}`;
    const hit = this.canViewAllCache.get(key);
    const now = Date.now();
    if (hit && now - hit.t < 10_000) return hit.v; // 10s cache
    // Fire and forget update of cache; return conservative true by default to avoid over-restricting
    (async () => {
      try {
        const u = await this.prisma.internalUser.findUnique({ where: { id: userId }, select: { canViewAllCases: true } });
        this.canViewAllCache.set(key, { v: !!u?.canViewAllCases, t: Date.now() });
      } catch {}
    })();
    return !!hit?.v;
  }

  // Helpers permessi/visibilità
  private isTrue(v?: string) { return v === '1' || (v || '').toLowerCase() === 'true'; }

  private async ensureCanView(req: any, reportId: string, tenantId: string) {
    const userId = req?.user?.sub as string | undefined;
    if (!userId) throw new BadRequestException('Tenant non valido');
    const report = await this.prisma.whistleReport.findFirst({ where: { id: reportId, clientId: tenantId }, select: { internalUserId: true } });
    if (!report) throw new NotFoundException('Segnalazione non trovata');
    if (report.internalUserId && report.internalUserId !== userId) {
      const viewer = await this.prisma.internalUser.findUnique({ where: { id: userId }, select: { canViewAllCases: true } });
      if (!viewer?.canViewAllCases) throw new ForbiddenException('Operazione non consentita');
    }
  }

  private async ensureCanOperate(req: any, reportId: string, tenantId: string) {
    const userId = req?.user?.sub as string | undefined;
    const role = ((req?.user?.role as string) || 'ADMIN').toUpperCase();
    if (!userId) throw new BadRequestException('Tenant non valido');
    const report = await this.prisma.whistleReport.findFirst({ where: { id: reportId, clientId: tenantId }, select: { internalUserId: true } });
    if (!report) throw new NotFoundException('Segnalazione non trovata');

    const canAdminsBypass = this.isTrue(process.env.CAN_ADMINS_BYPASS_ASSIGNMENT || 'true'); // default true
    const reqOpsAgent = this.isTrue(process.env.REQUIRE_ASSIGNMENT_FOR_OPS_AGENT || 'true'); // default true
    const reqOpsAdmin = this.isTrue(process.env.REQUIRE_ASSIGNMENT_FOR_OPS_ADMIN || 'false'); // default false

    if (report.internalUserId === userId) return; // assegnatario
    if (role === 'ADMIN' && canAdminsBypass && !reqOpsAdmin) return; // admin bypass

    // Se non assegnato e agent: richiedi claim esplicito
    if (!report.internalUserId && role === 'AGENT' && reqOpsAgent) {
      throw new ForbiddenException('Requiere assegnazione (usa /assign/me)');
    }
    throw new ForbiddenException('Operazione non consentita');
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
    await this.ensureCanOperate(req, dto.reportId, tenantId);

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
    if (!report) throw new NotFoundException('Risorsa interna non trovata');
    await this.ensureCanView(req, reportId, tenantId);

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
  async updateStatus(req: any, reportId: string, dto: CreateReportStatusDto) {
    const tokenClientId = req?.user?.clientId as string | undefined;
    if (!tokenClientId) throw new BadRequestException('Tenant non valido');
    const report = await this.prisma.whistleReport.findFirst({
      where: { id: reportId, clientId: tokenClientId },
    });
    if (!report) throw new NotFoundException('Segnalazione non trovata');
    await this.ensureCanOperate(req, reportId, tokenClientId);

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

    // eslint-disable-next-line no-console
    console.info('report status updated', { reportId, status: newStatus });

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
  await this.ensureCanOperate(req, reportId, tenantId);
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
  await this.ensureCanOperate(req, reportId, tenantId);
  const message = await this.prisma.reportMessage.findFirst({ where: { id: messageId, reportId, clientId: tenantId } });
  if (!message) throw new NotFoundException('Messaggio non trovato');
  if ((message as any).visibility !== 'INTERNAL') throw new ForbiddenException('Non è consentito modificare questo messaggio');

  const updatedMessage = await this.prisma.reportMessage.update({ where: { id: messageId }, data: { body } });
  return { message: 'Contenuto del messaggio aggiornato con successo', updatedMessage };
}


  /**
   * DELETE — elimina una segnalazione
   */
  async deleteReport(req: any, reportId: string) {
    const report = await this.prisma.whistleReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Segnalazione non trovata');

    const tokenClientId = req?.user?.clientId as string | undefined;
    if (!tokenClientId || tokenClientId !== report.clientId) {
      // eslint-disable-next-line no-console
      console.warn('deleteReport forbidden: tenant mismatch');
      throw new ForbiddenException('Operazione non consentita');
    }
    await this.ensureCanOperate(req, reportId, tokenClientId);

    await this.prisma.reportMessage.deleteMany({ where: { reportId } });
    await this.prisma.publicUser.deleteMany({ where: { reportId } });
    await this.prisma.whistleReport.delete({ where: { id: reportId } });

    // eslint-disable-next-line no-console
    console.info('report deleted', { reportId });

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
    await this.updateStatus(req, reportId, {
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

  // Assegnazioni
  async assignMe(req: any, reportId: string) {
    const tenantId = req?.user?.clientId as string | undefined;
    const userId = req?.user?.sub as string | undefined;
    if (!tenantId || !userId) throw new BadRequestException('Tenant non valido');
    const updated = await this.prisma.whistleReport.updateMany({ where: { id: reportId, clientId: tenantId, internalUserId: null }, data: { internalUserId: userId, assignedAt: new Date() } });
    if (updated.count !== 1) {
      const current = await this.prisma.whistleReport.findFirst({ where: { id: reportId, clientId: tenantId }, select: { internalUserId: true } });
      if (current?.internalUserId === userId) {
        return { message: 'ASSIGNED', reportId };
      }
      throw new ConflictException({ message: 'ALREADY_ASSIGNED', assignedTo: current?.internalUserId });
    }
    await this.prisma.reportMessage.create({ data: { clientId: tenantId, reportId, author: 'system', body: 'Caso assegnato a se stessi', note: 'CASE_ASSIGNED', visibility: 'SYSTEM' as any } });
    try { await this.notify.notifyAssignment(tenantId, reportId, userId!, { byUserId: userId! }); } catch {}
    return { message: 'ASSIGNED', reportId };
  }

  async assignTo(req: any, reportId: string, userId: string) {
    const tenantId = req?.user?.clientId as string | undefined;
    const byUserId = req?.user?.sub as string | undefined;
    if (!tenantId) throw new BadRequestException('Tenant non valido');
    // ensure target exists and belongs to tenant
    const target = await this.prisma.internalUser.findFirst({ where: { id: userId, clientId: tenantId }, select: { id: true } });
    if (!target) throw new NotFoundException('Utente target non trovato');
    await this.prisma.whistleReport.update({ where: { id: reportId }, data: { internalUserId: userId, assignedAt: new Date() } });
    await this.prisma.reportMessage.create({ data: { clientId: tenantId, reportId, author: 'system', body: `Caso assegnato a utente ${userId}`, note: 'CASE_ASSIGNED', visibility: 'SYSTEM' as any } });
    try { await this.notify.notifyAssignment(tenantId, reportId, userId, { byUserId }); } catch {}
    return { message: 'ASSIGNED', reportId, userId };
  }

  async unassign(req: any, reportId: string) {
    const tenantId = req?.user?.clientId as string | undefined;
    if (!tenantId) throw new BadRequestException('Tenant non valido');
    await this.prisma.whistleReport.update({ where: { id: reportId }, data: { internalUserId: null } });
    await this.prisma.reportMessage.create({ data: { clientId: tenantId, reportId, author: 'system', body: 'Caso rimosso dall\'assegnazione', note: 'CASE_UNASSIGNED', visibility: 'SYSTEM' as any } });
    return { message: 'UNASSIGNED', reportId };
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

  // ACCESS LOGS (ADMIN/AUDITOR)
  async getAccessLogs(req: any, reportId: string) {
    const tenantId = req?.user?.clientId as string | undefined;
    if (!tenantId) throw new BadRequestException('Tenant non valido');
    const report = await this.prisma.whistleReport.findFirst({ where: { id: reportId, clientId: tenantId }, select: { id: true } });
    if (!report) throw new NotFoundException('Segnalazione non trovata');
    return (this.prisma as any).reportAccessLog.findMany({ where: { reportId }, orderBy: { createdAt: 'desc' } });
  }

  // EXPORT PDF (MOCK/PDFKIT)
  async exportPdf(req: any, reportId: string): Promise<{ buffer: Buffer; filename: string }> {
    const tenantId = req?.user?.clientId as string | undefined;
    const userId = req?.user?.sub as string | undefined;
    if (!tenantId || !userId) throw new BadRequestException('Tenant non valido');
    const report = await this.prisma.whistleReport.findFirst({
      where: { id: reportId, clientId: tenantId },
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
        messages: { select: { id: true, author: true, body: true, createdAt: true, visibility: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!report) throw new NotFoundException('Segnalazione non trovata');

    const engine = (process.env.PDF_ENGINE || 'MOCK').toUpperCase();
    let buffer: Buffer;
    if (engine === 'PDFKIT') {
      try {
        const modName = 'pdfkit';
        // Use dynamic specifier to avoid TS static resolution when module is not installed
        const PDFDocument = (await import(modName as any)).default as any;
        const doc = new PDFDocument({ size: 'A4', margin: 48 });
        const chunks: Buffer[] = [];
        doc.on('data', (d: Buffer) => chunks.push(d));
        const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
        doc.fontSize(16).text('LetMeKnow - Export Segnalazione', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Codice: ${report.publicCode}`);
        doc.text(`Stato: ${report.status}`);
        doc.text(`Titolo: ${report.title}`);
        if (report.summary) doc.text(`Descrizione: ${report.summary}`);
        doc.text(`Creato: ${report.createdAt.toISOString()}`);
        doc.moveDown();
        doc.text('Messaggi:', { underline: true });
        for (const m of report.messages) {
          doc.moveDown(0.5).fontSize(10).text(`[${m.createdAt.toISOString()}] ${m.author} (${m.visibility}): ${m.body}`);
        }
        doc.end();
        buffer = await done;
      } catch (e) {
        throw new NotImplementedException('PDF engine non disponibile (installa pdfkit o usa MOCK)');
      }
    } else {
      // MOCK: semplice PDF minimale usando testo base
      const content = `Report ${report.publicCode}\nStato: ${report.status}\nTitolo: ${report.title}`;
      buffer = Buffer.from(`PDF MOCK\n${content}`, 'utf8');
    }

    // Access log (EXPORT)
    try {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.socket?.remoteAddress || '');
      const ua = (req.headers['user-agent'] as string) || undefined;
      await (this.prisma as any).reportAccessLog.create({ data: { reportId, userId, clientId: tenantId, action: 'EXPORT', ip: ip || undefined, ua } });
    } catch {}

    const filename = `report_${report.publicCode || report.id}.pdf`;
    return { buffer, filename };
  }

  /**
   * Elenco allegati (metadata) della segnalazione con controllo visibilità
   */
  async listAttachments(req: any, reportId: string) {
    const tenantId = req?.user?.clientId as string | undefined;
    const userId = req?.user?.sub as string | undefined;
    if (!tenantId) throw new BadRequestException('Tenant non valido');

    const report = await this.prisma.whistleReport.findFirst({
      where: { id: reportId, clientId: tenantId },
      select: { id: true, internalUserId: true },
    });
    if (!report) throw new NotFoundException('Segnalazione non trovata');

    if (report.internalUserId && userId && report.internalUserId !== userId) {
      const viewer = await this.prisma.internalUser.findUnique({ where: { id: userId }, select: { canViewAllCases: true } });
      if (!viewer?.canViewAllCases) {
        throw new NotFoundException('Segnalazione non trovata');
      }
    }

    const items = await this.prisma.reportAttachment.findMany({
      where: { reportId },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, storageKey: true, status: true as any, etag: true, finalKey: true, scannedAt: true, virusName: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    } as any);
    return items;
  }

  /**
   * Resolve bucket/key and metadata for an attachment ensuring access rules.
   */
  async resolveAttachmentAccess(req: any, reportId: string, attachmentId: string): Promise<{
    bucket: string;
    key: string;
    fileName: string;
    mimeType?: string;
    sizeBytes?: number;
    status?: string;
  }>
  {
    const tenantId = req?.user?.clientId as string | undefined;
    const userId = req?.user?.sub as string | undefined;
    if (!tenantId) throw new BadRequestException('Tenant non valido');

    const report = await this.prisma.whistleReport.findFirst({
      where: { id: reportId, clientId: tenantId },
      select: { id: true, internalUserId: true },
    });
    if (!report) throw new NotFoundException('Segnalazione non trovata');
    if (report.internalUserId && userId && report.internalUserId !== userId) {
      const viewer = await this.prisma.internalUser.findUnique({ where: { id: userId }, select: { canViewAllCases: true } });
      if (!viewer?.canViewAllCases) throw new NotFoundException('Segnalazione non trovata');
    }

    const att = await this.prisma.reportAttachment.findFirst({
      where: { id: attachmentId, reportId },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, storageKey: true, finalKey: true, status: true as any },
    } as any);
    if (!att) throw new NotFoundException('Allegato non trovato');

    const allowUnscanned = (process.env.ALLOW_UNSCANNED_DOWNLOAD || 'true').toLowerCase() === 'true' || process.env.ALLOW_UNSCANNED_DOWNLOAD === '1';
    const status = String((att as any).status || 'UPLOADED').toUpperCase();
    if (!allowUnscanned && status !== 'CLEAN') {
      throw new ForbiddenException('Allegato non disponibile (non ancora verificato)');
    }
    if (status === 'INFECTED') {
      throw new ForbiddenException('Allegato infetto');
    }

    const bucketTmp = process.env.S3_BUCKET_TMP || '';
    const bucketAttach = process.env.S3_BUCKET_ATTACH || '';

    const useAttach = status === 'CLEAN' && !!att.finalKey;
    const bucket = useAttach ? bucketAttach : bucketTmp;
    const key = (useAttach ? att.finalKey : att.storageKey) as string;
    if (!bucket || !key) throw new NotFoundException('Oggetto non disponibile');

    return { bucket, key, fileName: att.fileName, mimeType: att.mimeType || undefined, sizeBytes: att.sizeBytes || undefined, status };
  }
}



 







