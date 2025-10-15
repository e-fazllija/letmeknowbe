import { Injectable, NotFoundException, BadRequestException, PayloadTooLargeException, NotImplementedException } from '@nestjs/common';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';
import { CreatePublicReportDto } from './dto/create-public-report.dto';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

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
  constructor(private prisma: PrismaTenantService) {}

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

  async presign(tenantId: string) {
    if (!tenantId) throw new BadRequestException('Richiesta non valida');
    const presignEnabled = isTrue(process.env.PRESIGN_ENABLED);
    if (!presignEnabled) {
      throw new NotImplementedException('Presign disabilitato');
    }
    // Placeholder: integrazione storage non presente
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
          return report;
        });
        report = result;
        break;
      } catch (e: any) {
        const code = e?.code || e?.meta?.code;
        const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : e?.meta?.target;
        if (code === 'P2002' && (target?.includes('publicCode') || true)) {
          continue;
        }
        throw e;
      }
    }
    if (!report) throw new BadRequestException('Impossibile creare la segnalazione, riprovare');

    return { reportId: report.id, publicCode: publicCode.toUpperCase(), secret: secretRaw, createdAt: report.createdAt };
  }
}
