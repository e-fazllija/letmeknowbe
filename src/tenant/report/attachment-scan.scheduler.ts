import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { S3StorageService } from '../../storage/s3-storage.service';
import { scanWithClamAV } from './clamav.util';

function isTrue(v?: string) { return v === '1' || (v || '').toLowerCase() === 'true'; }

@Injectable()
export class AttachmentScanScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaTenantService, private storage: S3StorageService) {}

  onModuleInit() {
    const enabled = isTrue(process.env.ATTACH_SCAN_ENABLED) && !!(process.env.CLAMAV_HOST || '').trim();
    if (!enabled) return;
    const every = parseInt(process.env.ATTACH_SCAN_TIMER_MS || '', 10);
    const interval = !isNaN(every) && every > 0 ? every : 60_000; // default 60s
    // eslint-disable-next-line no-console
    console.info('Attachment scan scheduler enabled', { intervalMs: interval });
    this.timer = setInterval(() => { this.run().catch(() => {}); }, interval);
    this.run().catch(() => {});
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async run() {
    const host = process.env.CLAMAV_HOST || '';
    const port = parseInt(process.env.CLAMAV_PORT || '3310', 10) || 3310;
    const bucketTmp = process.env.S3_BUCKET_TMP || '';
    const bucketAttach = process.env.S3_BUCKET_ATTACH || '';
    const deleteInfected = isTrue(process.env.DELETE_INFECTED);

    // Pick a small batch of attachments marked as UPLOADED and with tmp path
    const items = await this.prisma.reportAttachment.findMany({
      where: { status: 'UPLOADED' as any, storageKey: { contains: '/tmp/' } },
      select: { id: true, reportId: true, storageKey: true },
      take: 20,
    } as any);

    for (const it of items) {
      try {
        await this.prisma.reportAttachment.update({ where: { id: it.id }, data: { status: 'SCANNING' as any } } as any);
        // Stream object from TMP bucket
        const key = it.storageKey;
        const stream = await this.storage.getObjectStream(bucketTmp, key);
        if (!stream) {
          // mark infected unknown if missing
          await this.prisma.reportAttachment.update({ where: { id: it.id }, data: { status: 'INFECTED' as any, virusName: 'OBJECT_MISSING', scannedAt: new Date() } } as any);
          await this.prisma.reportMessage.create({ data: { clientId: await this.findClientIdByReport(it.reportId), reportId: it.reportId, author: 'system', body: 'Allegato mancante in storage', note: 'ATTACHMENT_ERROR', visibility: 'SYSTEM' as any } });
          continue;
        }
        const res = await scanWithClamAV(host, port, stream as any);
        if (res.clean) {
          const finalKey = key.replace('/tmp/', '/att/');
          const copy = await this.storage.copyObject(bucketTmp, key, bucketAttach, finalKey);
          await this.prisma.reportAttachment.update({ where: { id: it.id }, data: { status: 'CLEAN' as any, finalKey, etag: copy?.etag, scannedAt: new Date() } } as any);
          // Optionally we could delete tmp after copy
          await this.storage.deleteObject(bucketTmp, key).catch(() => {});
        } else {
          await this.prisma.reportAttachment.update({ where: { id: it.id }, data: { status: 'INFECTED' as any, virusName: res.virus, scannedAt: new Date() } } as any);
          await this.prisma.reportMessage.create({ data: { clientId: await this.findClientIdByReport(it.reportId), reportId: it.reportId, author: 'system', body: `Allegato infetto: ${res.virus}`, note: 'ATTACHMENT_INFECTED', visibility: 'SYSTEM' as any } });
          if (deleteInfected) {
            await this.storage.deleteObject(bucketTmp, key).catch(() => {});
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Attachment scan error', { id: it.id, err: (e as any)?.message || e });
        await this.prisma.reportAttachment.update({ where: { id: it.id }, data: { status: 'UPLOADED' as any } } as any);
      }
    }
  }

  private async findClientIdByReport(reportId: string): Promise<string> {
    const r = await this.prisma.whistleReport.findUnique({ where: { id: reportId }, select: { clientId: true } });
    return r?.clientId || '';
  }
}
