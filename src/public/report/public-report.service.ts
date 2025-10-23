import { Injectable, NotFoundException, BadRequestException, PayloadTooLargeException, NotImplementedException } from '@nestjs/common';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';
import { S3StorageService } from '../../storage/s3-storage.service';
import { CreatePublicReportDto } from './dto/create-public-report.dto';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PublicReplyDto } from './dto/public-reply.dto';
import { AttachmentsFinalizeDto } from './dto/attachments-finalize.dto';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'application/pdf', 'text/plain']);
const EXT_FOR_MIME: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
};

function toBytes(mb: number) { return Math.floor(mb * 1024 * 1024); }
function isTrue(v?: string) { return v === '1' || (v || '').toLowerCase() === 'true'; }
function getExt(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.substring(i).toLowerCase() : '';
}
function mapSource(src: string): 'WEB'|'PHONE'|'EMAIL'|'OTHER' {
  const s = (src || '').toUpperCase();
  if (s === 'ALTRO') return 'OTHER';
  if (s === 'WEB' || s === 'PHONE' || s === 'EMAIL' || s === 'OTHER') return s as any;
  return 'OTHER';
}
function normalizeCode(): string {
  // R-XXXX-YYYY (alnum) length ~ 10
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n: number) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `R-${pick(4)}-${pick(4)}`.toUpperCase();
}
function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function hmacSha256Hex(key: string, data: string) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}
function detectPii(text: string): boolean {
  if (!text) return false;
  const email = /\b[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
  const phone = /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/;
  return email.test(text) || phone.test(text);
}

@Injectable()
export class PublicReportService {
  constructor(private prisma: PrismaTenantService, private storage: S3StorageService) {}

  private defaults() {
    return [
      { name: 'HR', sortOrder: 10, categories: ['Molestie', 'Discriminazioni', 'Mobbing'] },
      { name: 'Amministrazione/Finanza', sortOrder: 20, categories: ['Frode contabile', 'Fatture false', 'Appropriazione indebita'] },
      { name: 'IT', sortOrder: 30, categories: ['Sicurezza informatica', 'Accessi non autorizzati', 'Dati personali'] },
      { name: 'Compliance/Legal', sortOrder: 40, categories: ['Corruzione', 'Conflitto di interessi', 'Concorrenza sleale'] },
      { name: 'Sicurezza', sortOrder: 50, categories: ['Infortuni', 'Near-miss', 'Condizioni pericolose'] },
      { name: 'Altro', sortOrder: 90, categories: ['Altro'] },
    ];
  }

  private async maybeAutoBootstrapLookups(tenantId: string) {
    const auto = isTrue(process.env.AUTO_BOOTSTRAP_LOOKUPS);
    if (!auto) return;
    const existing = await this.prisma.department.count({ where: { clientId: tenantId } });
    if (existing > 0) return;
    const defs = this.defaults();
    await this.prisma.$transaction(async (tx) => {
      for (const d of defs) {
        const dep = await tx.department.create({
          data: { clientId: tenantId, name: d.name, sortOrder: d.sortOrder, active: true },
        });
        if (d.categories?.length) {
          await tx.category.createMany({
            data: d.categories.map((c, idx) => ({
              clientId: tenantId,
              departmentId: dep.id,
              name: c,
              active: true,
              sortOrder: idx,
            })),
          });
        }
      }
    });
  }

  async listDepartments(tenantId: string) {
    if (!tenantId) throw new BadRequestException('Richiesta non valida');
    await this.maybeAutoBootstrapLookups(tenantId);
    return this.prisma.department.findMany({
      where: { clientId: tenantId, active: true },
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async listCategories(tenantId: string, departmentId: string) {
    if (!tenantId) throw new BadRequestException('Richiesta non valida');
    if (!departmentId) throw new BadRequestException('departmentId mancante');

    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, clientId: tenantId, active: true },
      select: { id: true },
    });
    if (!department) {
      // 404 generico per scoping mismatch
      throw new NotFoundException('Risorsa non trovata');
    }

    return this.prisma.category.findMany({
      where: { clientId: tenantId, departmentId, active: true },
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async presign(tenantId: string, body?: any) {
    if (!tenantId) throw new BadRequestException('Richiesta non valida');
    const presignEnabled = isTrue(process.env.PRESIGN_ENABLED);
    if (!presignEnabled) {
      throw new NotImplementedException('Presign disabilitato');
    }
    const mode = (process.env.PRESIGN_MODE || '').toUpperCase();
    if (mode === 'MOCK') {
      const maxFileBytes = Math.floor((parseInt(process.env.ATTACH_MAX_FILE_MB || '10', 10)) * 1024 * 1024);
      const proofSecret = process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';
      const makeItem = (file?: { fileName?: string; mimeType?: string; sizeBytes?: number }) => {
        const id = (crypto as any).randomUUID ? (crypto as any).randomUUID() : crypto.randomBytes(16).toString('hex');
        const extFromName = file?.fileName ? (file.fileName.lastIndexOf('.') >= 0 ? file.fileName.substring(file.fileName.lastIndexOf('.')).toLowerCase() : '') : '';
        const extFromMime = file?.mimeType ? (EXT_FOR_MIME[file.mimeType]?.[0] || '') : '';
        const ext = extFromName || extFromMime || '';
        const storageKey = `${tenantId}/tmp/${id}${ext}`;
        const mime = file?.mimeType || 'application/octet-stream';
        const proof = hmacSha256Hex(proofSecret, storageKey);
        return {
          storageKey,
          method: 'PUT',
          uploadUrl: `https://example.invalid/upload/${encodeURIComponent(storageKey)}`,
          headers: { 'content-type': mime },
          maxSizeBytes: maxFileBytes,
          expiresIn: 300,
          proof,
        };
      };
      // Body opzionale: { files: [{ fileName, mimeType, sizeBytes }] }
      const items = Array.isArray(body?.files) && body.files.length > 0 ? body.files.map((f: any) => makeItem(f)) : [makeItem()];
      return { items };
    }
    if (mode === 'REAL') {
      const itemsInput: Array<{ fileName?: string; mimeType?: string; sizeBytes?: number }>
        = Array.isArray(body?.files) && body.files.length > 0 ? body.files : [{}];
      const bucket = process.env.S3_BUCKET_TMP || '';
      const sseMode = ((process.env.S3_SSE_MODE || 'S3').toUpperCase() as any) || 'S3';
      const kmsKeyId = process.env.S3_KMS_KEY_ID || undefined;
      const proofSecret = process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';

      const results = [] as any[];
      for (const f of itemsInput) {
        const id = (crypto as any).randomUUID ? (crypto as any).randomUUID() : crypto.randomBytes(16).toString('hex');
        const extFromName = f?.fileName ? (f.fileName.lastIndexOf('.') >= 0 ? f.fileName.substring(f.fileName.lastIndexOf('.')).toLowerCase() : '') : '';
        const extFromMime = f?.mimeType ? (EXT_FOR_MIME[f.mimeType]?.[0] || '') : '';
        const ext = extFromName || extFromMime || '';
        const storageKey = `${tenantId}/tmp/${id}${ext}`;
        const presigned = await this.storage.presignPut({
          bucket,
          key: storageKey,
          contentType: f?.mimeType || 'application/octet-stream',
          expiresInSeconds: 300,
          sseMode,
          kmsKeyId,
        });
        const proof = hmacSha256Hex(proofSecret, storageKey);
        results.push({
          storageKey,
          method: 'PUT',
          uploadUrl: presigned.uploadUrl,
          headers: presigned.headers,
          maxSizeBytes: toBytes(parseInt(process.env.ATTACH_MAX_FILE_MB || '10', 10)),
          expiresIn: presigned.expiresIn,
          proof,
        });
      }
      return { items: results };
    }
    throw new NotImplementedException('Presign non implementato');
  }

  async createReport(tenantId: string, dto: CreatePublicReportDto, req: Request) {
    if (!tenantId) throw new BadRequestException('Richiesta non valida');

    // Validate department/category scoping
    const department = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, clientId: tenantId, active: true },
      select: { id: true },
    });
    if (!department) throw new NotFoundException('Risorsa non trovata');

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, clientId: tenantId, departmentId: dto.departmentId, active: true },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Risorsa non trovata');

    // Attachments policy
    const presignEnabled = isTrue(process.env.PRESIGN_ENABLED);
    const maxFiles = parseInt(process.env.ATTACH_MAX_FILES || '3', 10);
    const maxFileBytes = toBytes(parseInt(process.env.ATTACH_MAX_FILE_MB || '10', 10));
    const maxTotalBytes = toBytes(parseInt(process.env.ATTACH_MAX_TOTAL_MB || '20', 10));

    const attachments = dto.attachments || [];
    if (attachments.length > 0 && !presignEnabled) {
      throw new BadRequestException('Allegati non consentiti');
    }
    if (attachments.length > maxFiles) {
      throw new PayloadTooLargeException('Troppe parti allegate');
    }
    let total = 0;
    for (const a of attachments) {
      if (!ALLOWED_MIME.has(a.mimeType)) {
        throw new BadRequestException('Tipo file non consentito');
      }
      const ext = getExt(a.fileName);
      const allowedExt = EXT_FOR_MIME[a.mimeType] || [];
      if (!allowedExt.includes(ext)) {
        throw new BadRequestException('Estensione incoerente con MIME');
      }
      if (!a.storageKey || !a.storageKey.startsWith(`${tenantId}/`)) {
        throw new BadRequestException('storageKey non valido');
      }
      const requireProof = isTrue(process.env.PRESIGN_PROOF_REQUIRED);
      if (requireProof) {
        const proofSecret = process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';
        const expected = hmacSha256Hex(proofSecret, a.storageKey);
        if (!a.proof || a.proof !== expected) {
          throw new BadRequestException('proof non valida o mancante');
        }
      }
      if (a.sizeBytes > maxFileBytes) {
        throw new PayloadTooLargeException('File oltre il limite');
      }
      total += a.sizeBytes || 0;
      if (total > maxTotalBytes) {
        throw new PayloadTooLargeException('Dimensione totale oltre il limite');
      }
    }

    // PII soft-check
    const piiEnabled = isTrue(process.env.PII_CHECK_ENABLED);
    const containsPII = piiEnabled && (detectPii(dto.subject) || detectPii(dto.description));

    // Secret (32+ bytes) + bcrypt hash with pepper
    const secretRaw = base64url(crypto.randomBytes(32));
    const pepper = process.env.REPORT_SECRET_PEPPER || 'dev_report_pepper';
    const cost = parseInt(process.env.REPORT_SECRET_COST || '12', 10);
    const secretHash = await bcrypt.hash(secretRaw + pepper, cost);
    const tokenSha = crypto.createHash('sha256').update(secretRaw).digest('hex');

    // Public code with retry on conflict
    const now = new Date();
    const channel = mapSource(dto.source);
    const eventDate = new Date(dto.date);
    const privacy = (dto.privacy || 'ANONIMO').toUpperCase();
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.socket?.remoteAddress || '');
    const ipPepper = process.env.IP_HASH_PEPPER || 'dev_ip_pepper';
    const ipHash = ip ? hmacSha256Hex(ipPepper, ip) : undefined;
    const ua = (req.headers['user-agent'] as string) || undefined;

    let report: any;
    let publicCode = '';
    for (let i = 0; i < 5; i++) {
      try {
        publicCode = normalizeCode();
        const result = await this.prisma.$transaction(async (tx) => {
          const report = await tx.whistleReport.create({
            data: {
              clientId: tenantId,
              publicCode: publicCode,
              secretHash: secretHash,
              status: 'OPEN' as any,
              title: dto.subject,
              summary: dto.description,
              createdAt: now,
              channel: channel as any,
              eventDate,
              privacy: privacy as any,
              departmentId: dto.departmentId,
              categoryId: dto.categoryId,
              containsPIISuspected: !!containsPII,
              ipHash,
              ua,
            },
          });
          await tx.publicUser.create({ data: { clientId: tenantId, token: tokenSha, reportId: report.id } });
          if (attachments.length > 0) {
            await tx.reportAttachment.createMany({
              data: attachments.map((a) => ({
                reportId: report.id,
                fileName: a.fileName,
                mimeType: a.mimeType,
                sizeBytes: a.sizeBytes,
                storageKey: a.storageKey,
              })),
            });
          }
          // Public receipt at creation (optional)
          if (isTrue(process.env.PUBLIC_AUTO_ACK)) {
            const body = 'Ricevuta: la tua segnalazione è stata registrata. Riceverai aggiornamenti entro i tempi previsti.';
            await tx.reportMessage.create({
              data: {
                clientId: tenantId,
                reportId: report.id,
                author: 'AGENTE',
                body,
                note: 'PUBLIC_RECEIPT',
                visibility: 'PUBLIC' as any,
              },
            });
          }
          return report;
        });
        report = result;
        break;
      } catch (e: any) {
        const code = e?.code || e?.meta?.code;
        const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : e?.meta?.target;
        if (code === 'P2002' && target?.includes('publicCode')) {
          continue;
        }
        throw e;
      }
    }
    if (!report) throw new BadRequestException('Impossibile creare la segnalazione, riprovare');

    return { reportId: report.id, publicCode: publicCode.toUpperCase(), secret: secretRaw, createdAt: report.createdAt };
  }

  /**
   * Finalize upload allegati in TMP: valida HMAC, ETag e size. Non sposta i file.
   * Integrazione ClamAV/promozione verrà gestita dallo scheduler nella milestone successiva.
   */
  async finalize(tenantId: string, dto: AttachmentsFinalizeDto) {
    if (!tenantId) throw new BadRequestException('Richiesta non valida');
    const items = Array.isArray(dto?.items) ? dto.items : [];
    if (items.length === 0) throw new BadRequestException('Nessun elemento da finalizzare');

    const bucketTmp = process.env.S3_BUCKET_TMP || '';
    const finalizeSecret = process.env.UPLOAD_FINALIZE_SECRET || process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';

    const accepted: any[] = [];
    const rejected: any[] = [];

    for (const it of items) {
      try {
        if (!it.storageKey || !it.storageKey.startsWith(`${tenantId}/tmp/`)) throw new BadRequestException('storageKey non valido');
        // HMAC opzionale ma consigliato
        if (it.hmac) {
          const expected = hmacSha256Hex(finalizeSecret, it.storageKey);
          if (expected !== it.hmac) throw new BadRequestException('HMAC non valido');
        }
        // HEAD su S3/MinIO per coerenza etag/size (best-effort)
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

  /**
   * Replica del segnalante a una richiesta di chiarimenti
   */
  async reply(tenantId: string, dto: PublicReplyDto, req: Request, includeThread = false) {
    if (!tenantId) throw new BadRequestException('Richiesta non valida');

    const presignEnabled = isTrue(process.env.PRESIGN_ENABLED);
    const maxFiles = parseInt(process.env.ATTACH_MAX_FILES || '3', 10);
    const maxFileBytes = toBytes(parseInt(process.env.ATTACH_MAX_FILE_MB || '10', 10));
    const maxTotalBytes = toBytes(parseInt(process.env.ATTACH_MAX_TOTAL_MB || '20', 10));

    const attachments = dto.attachments || [];
    if (attachments.length > 0 && !presignEnabled) {
      throw new BadRequestException('Allegati non consentiti');
    }
    if (attachments.length > maxFiles) {
      throw new PayloadTooLargeException('Troppe parti allegate');
    }
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

    // Lookup report by (tenantId, publicCode) and verify secret with bcrypt+pepper
    const publicCode = (dto.publicCode || '').toUpperCase();
    const report = await this.prisma.whistleReport.findFirst({ where: { clientId: tenantId, publicCode } });
    if (!report) throw new NotFoundException('Risorsa non trovata');

    const pepper = process.env.REPORT_SECRET_PEPPER || 'dev_report_pepper';
    const ok = await bcrypt.compare(dto.secret + pepper, report.secretHash);
    if (!ok) throw new NotFoundException('Risorsa non trovata');

    // PII soft-check on reply body
    const piiEnabled = isTrue(process.env.PII_CHECK_ENABLED);
    if (piiEnabled && detectPii(dto.body)) {
      await this.prisma.whistleReport.update({ where: { id: report.id }, data: { containsPIISuspected: true } });
    }

    // Create PUBLIC message from whistleblower
    const msg = await this.prisma.reportMessage.create({
      data: {
        clientId: tenantId,
        reportId: report.id,
        author: 'SEGNALANTE',
        body: dto.body,
        visibility: 'PUBLIC' as any,
      },
    });

    if (attachments.length > 0) {
      await this.prisma.reportAttachment.createMany({
        data: attachments.map((a) => ({
          reportId: report.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          storageKey: a.storageKey,
        })),
      });
    }

    let newStatus: string | undefined;
    if ((report as any).status === 'NEED_INFO') {
      // auto transition to IN_PROGRESS + audit + system message
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.whistleReport.update({ where: { id: report.id }, data: { status: 'IN_PROGRESS' as any, inProgressAt: now } }),
        this.prisma.reportStatusHistory.create({
          data: { clientId: tenantId, reportId: report.id, status: 'IN_PROGRESS' as any, author: 'WB_REPLY', note: 'Replica ricevuta' },
        }),
        this.prisma.reportMessage.create({
          data: { clientId: tenantId, reportId: report.id, author: 'system', body: 'Replica ricevuta dal segnalante', visibility: 'SYSTEM' as any },
        }),
      ]);
      newStatus = 'IN_PROGRESS';
    }

    if (!includeThread) {
      return { messageId: msg.id, createdAt: msg.createdAt, ...(newStatus ? { newStatus } : {}) };
    }

    const thread = await this.prisma.reportMessage.findMany({
      where: { reportId: report.id, visibility: 'PUBLIC' as any },
      select: { id: true, author: true, body: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return { messageId: msg.id, createdAt: msg.createdAt, ...(newStatus ? { newStatus } : {}), thread };
  }

  /**
   * Stato pubblico (by publicCode + secret). Ritorna info sicure + thread PUBLIC.
   */
  async publicStatus(tenantId: string, publicCode: string, secret: string) {
    if (!tenantId) throw new BadRequestException('Richiesta non valida');
    if (!publicCode || !secret) throw new BadRequestException('Parametri mancanti');
    const tokenSha = crypto.createHash('sha256').update(secret).digest('hex');
    const user = await this.prisma.publicUser.findFirst({
      where: { clientId: tenantId, token: tokenSha },
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
    const code = (publicCode || '').toUpperCase();
    if (!user || !user.report || (user.report.publicCode || '').toUpperCase() !== code) {
      throw new NotFoundException('Token non valido o segnalazione non trovata');
    }
    return { message: 'Segnalazione trovata', report: user.report };
  }
}
