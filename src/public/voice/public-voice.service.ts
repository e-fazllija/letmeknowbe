import { BadRequestException, Injectable, NotFoundException, NotImplementedException, PayloadTooLargeException } from '@nestjs/common';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';
import { CreateVoiceReportDto } from './dto/create-voice-report.dto';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const AUDIO_MIME = new Set(['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg']);
const EXT_FOR_MIME: Record<string, string[]> = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/webm': ['.webm'],
  'audio/ogg': ['.ogg'],
};

function toBytes(mb: number) { return Math.floor(mb * 1024 * 1024); }
function isTrue(v?: string) { return v === '1' || (v || '').toLowerCase() === 'true'; }
function getExt(name: string) { const i = name.lastIndexOf('.'); return i >= 0 ? name.substring(i).toLowerCase() : ''; }
function normalizeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n: number) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `R-${pick(4)}-${pick(4)}`.toUpperCase();
}
function base64url(buf: Buffer) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function hmacSha256Hex(key: string, data: string) { return crypto.createHmac('sha256', key).update(data).digest('hex'); }
function detectPii(text: string) {
  if (!text) return false;
  const email = /\b[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
  const phone = /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/;
  return email.test(text) || phone.test(text);
}

@Injectable()
export class PublicVoiceService {
  constructor(private prisma: PrismaTenantService) {}

  async presign(tenantId: string, body?: any) {
    const presignEnabled = isTrue(process.env.PRESIGN_ENABLED);
    if (!presignEnabled) {
      // 501: presign non abilitato
      throw new NotImplementedException('Presign disabilitato');
    }
    const mode = (process.env.PRESIGN_MODE || '').toUpperCase();
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
    // Placeholder: integrazione storage non presente
    throw new NotImplementedException('Presign non implementato');
  }

  async createVoiceReport(tenantId: string, dto: CreateVoiceReportDto, req: Request) {
    if (!tenantId) throw new BadRequestException('Richiesta non valida');

    const department = await this.prisma.department.findFirst({ where: { id: dto.departmentId, clientId: tenantId, active: true }, select: { id: true } });
    if (!department) throw new NotFoundException('Risorsa non trovata');
    const category = await this.prisma.category.findFirst({ where: { id: dto.categoryId, clientId: tenantId, departmentId: dto.departmentId, active: true }, select: { id: true } });
    if (!category) throw new NotFoundException('Risorsa non trovata');

    const attachments = dto.attachments || [];
    const presignEnabled = isTrue(process.env.PRESIGN_ENABLED);
    if (!attachments.length) throw new BadRequestException('Allegato audio richiesto');
    if (!presignEnabled) throw new BadRequestException('Allegati non consentiti');

    const maxFiles = parseInt(process.env.ATTACH_MAX_FILES || '3', 10);
    const maxFileBytes = toBytes(parseInt(process.env.ATTACH_MAX_FILE_MB || '10', 10));
    const maxTotalBytes = toBytes(parseInt(process.env.ATTACH_MAX_TOTAL_MB || '20', 10));
    if (attachments.length > maxFiles) throw new PayloadTooLargeException('Troppe parti allegate');

    let total = 0;
    for (const a of attachments) {
      if (!AUDIO_MIME.has(a.mimeType)) throw new BadRequestException('Tipo audio non consentito');
      const ext = getExt(a.fileName);
      const allowedExt = EXT_FOR_MIME[a.mimeType] || [];
      if (!allowedExt.includes(ext)) throw new BadRequestException('Estensione incoerente con MIME');
      if (!a.storageKey || !a.storageKey.startsWith(`${tenantId}/`)) throw new BadRequestException('storageKey non valido');
      const requireProof = isTrue(process.env.PRESIGN_PROOF_REQUIRED);
      if (requireProof) {
        const proofSecret = process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';
        const expected = hmacSha256Hex(proofSecret, a.storageKey);
        if (!a.proof || a.proof !== expected) {
          throw new BadRequestException('proof non valida o mancante');
        }
      }
      if (a.sizeBytes > maxFileBytes) throw new PayloadTooLargeException('File oltre il limite');
      total += a.sizeBytes || 0;
      if (total > maxTotalBytes) throw new PayloadTooLargeException('Dimensione totale oltre il limite');
    }

    const subject = dto.subject;
    const summary = dto.description || 'Segnalazione vocale: trascrizione in elaborazione.';

    const now = new Date();
    const eventDate = new Date(dto.date);
    const privacy = (dto.privacy || 'ANONIMO').toUpperCase();

    const secretRaw = base64url(crypto.randomBytes(32));
    const pepper = process.env.REPORT_SECRET_PEPPER || 'dev_report_pepper';
    const cost = parseInt(process.env.REPORT_SECRET_COST || '12', 10);
    const secretHash = await bcrypt.hash(secretRaw + pepper, cost);
    const tokenSha = crypto.createHash('sha256').update(secretRaw).digest('hex');

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.socket?.remoteAddress || '');
    const ipPepper = process.env.IP_HASH_PEPPER || 'dev_ip_pepper';
    const ipHash = ip ? hmacSha256Hex(ipPepper, ip) : undefined;
    const ua = (req.headers['user-agent'] as string) || undefined;

    // PII soft-check
    const piiEnabled = isTrue(process.env.PII_CHECK_ENABLED);
    const containsPII = piiEnabled && (detectPii(subject) || detectPii(summary));

    let report: any;
    let publicCode = '';
    for (let i = 0; i < 5; i++) {
      try {
        publicCode = normalizeCode();
        report = await this.prisma.$transaction(async (tx) => {
          const report = await tx.whistleReport.create({
            data: {
              clientId: tenantId,
              publicCode,
              secretHash,
              status: 'OPEN' as any,
              title: subject,
              summary,
              createdAt: now,
              channel: 'OTHER' as any,
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
          await tx.reportAttachment.createMany({
            data: attachments.map((a) => ({
              reportId: report.id,
              fileName: a.fileName,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
              storageKey: a.storageKey,
            })),
          });
          return report;
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
}
