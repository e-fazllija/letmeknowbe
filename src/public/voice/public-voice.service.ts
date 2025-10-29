import { BadRequestException, Injectable, NotFoundException, NotImplementedException, PayloadTooLargeException } from '@nestjs/common';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';
import { S3StorageService } from '../../storage/s3-storage.service';
import { CreateVoiceReportDto } from './dto/create-voice-report.dto';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { TranscribeRequestDto } from './dto/transcribe-request.dto';

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

function guessMimeFromExt(ext: string): string | undefined {
  if (!ext) return undefined;
  for (const [mime, exts] of Object.entries(EXT_FOR_MIME)) {
    if (exts.includes(ext)) return mime;
  }
  return undefined;
}

@Injectable()
export class PublicVoiceService {
  constructor(private prisma: PrismaTenantService, private storage: S3StorageService) {}

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
    if (mode === 'REAL') {
      const itemsInput: Array<{ fileName?: string; mimeType?: string; sizeBytes?: number }> = Array.isArray(body?.files) && body.files.length > 0 ? body.files : [{}];
      const bucket = process.env.S3_BUCKET_TMP || '';
      const sseMode = ((process.env.S3_SSE_MODE || 'S3').toUpperCase() as any) || 'S3';
      const kmsKeyId = process.env.S3_KMS_KEY_ID || undefined;
      const proofSecret = process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';

      const results = [] as any[];
      for (const f of itemsInput) {
        const id = (crypto as any).randomUUID ? (crypto as any).randomUUID() : crypto.randomBytes(16).toString('hex');
        const extFromName = f?.fileName ? getExt(f.fileName) : '';
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

  async createVoiceReport(tenantId: string, dto: CreateVoiceReportDto, req: Request) {
    if (!tenantId) throw new BadRequestException('Richiesta non valida');

    const department = await this.prisma.department.findFirst({ where: { id: dto.departmentId, clientId: tenantId, active: true }, select: { id: true } });
    if (!department) throw new NotFoundException('Risorsa non trovata');
    const category = await this.prisma.category.findFirst({ where: { id: dto.categoryId, clientId: tenantId, departmentId: dto.departmentId, active: true }, select: { id: true } });
    if (!category) throw new NotFoundException('Risorsa non trovata');

    const attachments = dto.attachments || [];
    const presignEnabled = isTrue(process.env.PRESIGN_ENABLED);
    if (attachments.length > 0 && !presignEnabled) throw new BadRequestException('Allegati non consentiti');

    const maxFiles = parseInt(process.env.ATTACH_MAX_FILES || '3', 10);
    const maxFileBytes = toBytes(parseInt(process.env.ATTACH_MAX_FILE_MB || '10', 10));
    const maxTotalBytes = toBytes(parseInt(process.env.ATTACH_MAX_TOTAL_MB || '20', 10));
    if (attachments.length > 0 && attachments.length > maxFiles) throw new PayloadTooLargeException('Troppe parti allegate');

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
        break;
      } catch (e: any) {
        const code = e?.code || e?.meta?.code;
        const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(',') : e?.meta?.target;
        if (code === 'P2002' && target?.includes('publicCode')) continue;
        throw e;
      }
    }
    if (!report) throw new BadRequestException('Impossibile creare la segnalazione, riprovare');

    // Enqueue soft transcription job (marker) if enabled
    if (isTrue(process.env.TRANSCRIBE_ENABLED)) {
      try {
        await this.prisma.reportMessage.create({
          data: {
            clientId: tenantId,
            reportId: report.id,
            author: 'system',
            body: 'Trascrizione in coda (soft enqueue).',
            note: 'TRANSCRIPT_JOB_QUEUED',
            visibility: 'SYSTEM' as any,
          },
        });
      } catch {
        // ignore enqueue failure (non-bloccante)
      }
    }

    return { reportId: report.id, publicCode: publicCode.toUpperCase(), secret: secretRaw, createdAt: report.createdAt };
  }

  async transcribe(tenantId: string, dto: TranscribeRequestDto): Promise<{ text: string; attachment?: { fileName: string; mimeType: string; sizeBytes: number; storageKey: string; proof?: string } }> {
    const storageKey = (dto.storageKey || '').trim();
    if (!storageKey || !storageKey.startsWith(`${tenantId}/`)) throw new BadRequestException('storageKey non valido');

    const bucketTmp = process.env.S3_BUCKET_TMP || '';
    const bucketAttach = process.env.S3_BUCKET_ATTACH || '';
    const isFinal = storageKey.includes('/att/');
    const bucket = isFinal ? bucketAttach : bucketTmp;

    const stream = await this.storage.getObjectStream(bucket, storageKey);
    if (!stream) throw new NotFoundException('Oggetto non trovato in storage');

    const buffer = await this.streamToBuffer(stream as any);
    const fileName = storageKey.split('/').pop() || 'audio';
    const model = (dto.modelName || process.env.WHISPER_MODEL || '').trim();
    const text = await this.whisperCall(buffer, fileName, 'application/octet-stream', model);
    if (dto.includeAudio) {
      const ext = getExt(fileName) || getExt(storageKey);
      const mime = guessMimeFromExt(ext) || 'audio/mpeg';
      const proofSecret = process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';
      const proof = hmacSha256Hex(proofSecret, storageKey);
      return { text, attachment: { fileName, mimeType: mime, sizeBytes: buffer.length, storageKey, proof } };
    }
    return { text };
  }

  async transcribeFromUpload(tenantId: string, file: any, modelName?: string): Promise<{ text: string }> {
    if (!file || !file.buffer) throw new BadRequestException('File mancante');
    const mime = (file.mimetype || '').toLowerCase();
    if (!AUDIO_MIME.has(mime as any)) throw new BadRequestException('Tipo audio non consentito');
    const name = file.originalname || 'audio';
    const model = (modelName || process.env.WHISPER_MODEL || '').trim();
    const text = await this.whisperCall(file.buffer, name, mime, model);
    return { text };
  }

  async transcribeGateway(tenantId: string, file: any, body: any): Promise<{ text: string; attachment?: { fileName: string; mimeType: string; sizeBytes: number; storageKey: string; proof?: string }; attachedToReportId?: string }> {
    const model = ((body?.modelName as string) || process.env.WHISPER_MODEL || '').trim();
    const includeAudio = isTrue(body?.includeAudio) || false;

    let text = '';
    let attachment: { fileName: string; mimeType: string; sizeBytes: number; storageKey: string; proof?: string } | undefined;

    if (file && file.buffer) {
      const mime = (file.mimetype || '').toLowerCase();
      if (!AUDIO_MIME.has(mime as any)) throw new BadRequestException('Tipo audio non consentito');
      const name = file.originalname || 'audio';
      text = await this.whisperCall(file.buffer, name, mime, model);
      if (includeAudio) {
        const bucket = process.env.S3_BUCKET_TMP || '';
        const sseMode = ((process.env.S3_SSE_MODE || 'S3').toUpperCase() as any) || 'S3';
        const kmsKeyId = process.env.S3_KMS_KEY_ID || undefined;
        const id = (crypto as any).randomUUID ? (crypto as any).randomUUID() : crypto.randomBytes(16).toString('hex');
        const extFromName = getExt(name);
        const extFromMime = (EXT_FOR_MIME[mime]?.[0] || '');
        const ext = extFromName || extFromMime || '';
        const storageKey = `${tenantId}/tmp/${id}${ext}`;
        const presigned = await this.storage.presignPut({ bucket, key: storageKey, contentType: mime || 'application/octet-stream', expiresInSeconds: 300, sseMode, kmsKeyId });
        const fetchAny = (globalThis as any).fetch as typeof fetch;
        if (!fetchAny) throw new NotImplementedException('Runtime fetch non disponibile');
        const putRes = await fetchAny(presigned.uploadUrl, { method: 'PUT', headers: presigned.headers, body: file.buffer as any });
        if (!putRes.ok) {
          const t = await putRes.text().catch(() => '');
          throw new BadRequestException(`Upload allegato fallito: ${putRes.status} ${t?.slice(0,200)}`);
        }
        const proofSecret = process.env.PRESIGN_PROOF_SECRET || 'dev_presign_proof_secret';
        const proof = hmacSha256Hex(proofSecret, storageKey);
        attachment = { fileName: name, mimeType: mime, sizeBytes: file.size || file.buffer.length, storageKey, proof };
      }
    } else if ((body?.storageKey as string)?.trim()) {
      const dto: TranscribeRequestDto = {
        storageKey: (body.storageKey as string).trim(),
        modelName: model || undefined,
        includeAudio,
      } as any;
      const res = await this.transcribe(tenantId, dto);
      text = res.text;
      attachment = res.attachment;
    } else {
      throw new BadRequestException('Fornire un file audio o una storageKey');
    }

    // Se richiesto, allega direttamente al report esistente (protetto da secret)
    const reportId = (body?.reportId as string)?.trim();
    const secret = (body?.secret as string) || '';
    if (includeAudio && attachment && reportId) {
      if (!secret) throw new BadRequestException('Secret richiesto per allegare al report');
      const tokenSha = crypto.createHash('sha256').update(secret).digest('hex');
      const user = await this.prisma.publicUser.findFirst({ where: { clientId: tenantId, token: tokenSha, reportId }, select: { id: true } });
      if (!user) throw new NotFoundException('Report o credenziali non valide');
      await this.prisma.reportAttachment.create({
        data: {
          reportId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          storageKey: attachment.storageKey,
        },
      } as any);
      return { text, attachment, attachedToReportId: reportId };
    }

    return { text, attachment };
  }

  private async whisperCall(buffer: Buffer, fileName: string, contentType?: string, modelName?: string): Promise<string> {
    const url = (process.env.WHISPER_URL || '').trim();
    if (!url) throw new NotImplementedException('Whisper non configurato (WHISPER_URL mancante)');
    const FormDataAny = (globalThis as any).FormData;
    const BlobAny = (globalThis as any).Blob;
    const fetchAny = (globalThis as any).fetch as typeof fetch;
    if (!FormDataAny || !BlobAny || !fetchAny) throw new NotImplementedException('Runtime fetch/FormData non disponibili');
    const form = new FormDataAny();
    const blob = new BlobAny([buffer], { type: contentType || 'application/octet-stream' });
    form.append('audio_file', blob, fileName || 'audio');
    const model = (modelName || '').trim();
    if (model) form.append('model_name', model);
    const resp = await fetchAny(url, { method: 'POST', body: form as any });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new BadRequestException(`Whisper HTTP ${resp.status}: ${txt?.slice(0, 300)}`);
    }
    const data: any = await resp.json().catch(async () => ({ transcription: await resp.text() }));
    const text = (data?.transcription || data?.text || '').toString().trim();
    if (!text) throw new BadRequestException('Risposta Whisper senza testo');
    return text;
  }

  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream as any) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
