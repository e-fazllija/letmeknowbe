import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { S3StorageService } from '../../storage/s3-storage.service';

function isTrue(v?: string) { return v === '1' || (v || '').toLowerCase() === 'true'; }

function daysFromEnv(): number {
  const d = parseInt(process.env.DATA_RETENTION_DAYS || '', 10);
  if (!isNaN(d) && d > 0) return d;
  const y = parseInt(process.env.DATA_RETENTION_YEARS || '5', 10);
  const years = isNaN(y) || y <= 0 ? 5 : y;
  return years * 365;
}

@Injectable()
export class ReportRetentionScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaTenantService, private storage: S3StorageService) {}

  onModuleInit() {
    const enabled = isTrue(process.env.RETENTION_ENABLED);
    if (!enabled) return;
    const every = parseInt(process.env.RETENTION_TIMER_MS || '', 10);
    const interval = !isNaN(every) && every > 0 ? every : 24 * 60 * 60 * 1000; // daily
    // eslint-disable-next-line no-console
    console.info('Report retention scheduler enabled', { intervalMs: interval });
    this.timer = setInterval(() => { this.run().catch((e) => { try { console.warn('Retention error', e?.message || e); } catch {} }); }, interval);
    this.run().catch(() => {});
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async run() {
    const now = new Date();
    const retentionDays = daysFromEnv();
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const batch = parseInt(process.env.RETENTION_BATCH || '50', 10) || 50;
    const dryRun = isTrue(process.env.RETENTION_DRY_RUN);

    // pick candidates with retentionAt <= now OR (retentionAt null && createdAt <= cutoff)
    const candidates = await this.prisma.whistleReport.findMany({
      where: { OR: [ { retentionAt: { lte: now } }, { AND: [ { retentionAt: null }, { createdAt: { lte: cutoff } } ] } ] },
      select: { id: true, clientId: true },
      take: batch,
    });

    if (candidates.length === 0) return;

    const bucketTmp = process.env.S3_BUCKET_TMP || '';
    const bucketAttach = process.env.S3_BUCKET_ATTACH || '';

    for (const r of candidates) {
      try {
        if (dryRun) {
          // eslint-disable-next-line no-console
          console.info('Retention dry-run: would purge report', { reportId: r.id });
          // Ensure retentionAt is set for visibility
          const ra = new Date(now.getTime());
          await this.prisma.whistleReport.update({ where: { id: r.id }, data: { retentionAt: ra } });
          continue;
        }

        // Delete S3 objects (best-effort)
        const atts = await this.prisma.reportAttachment.findMany({ where: { reportId: r.id }, select: { storageKey: true, finalKey: true } });
        for (const a of atts) {
          try { if (a.finalKey) await this.storage.deleteObject(bucketAttach, a.finalKey); } catch {}
          try { if (a.storageKey) await this.storage.deleteObject(bucketTmp, a.storageKey); } catch {}
        }

        // Remove PublicUser rows first (relation is not cascade)
        await this.prisma.publicUser.deleteMany({ where: { reportId: r.id } });

        // Cascade delete the report (attachments/messages/status/access logs cascade)
        await this.prisma.whistleReport.delete({ where: { id: r.id } });

        // Optionally add access log (best-effort)
        try { await (this.prisma as any).reportAccessLog.create({ data: { reportId: r.id, clientId: r.clientId, action: 'RETENTION_PURGE', userId: null } }); } catch {}
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Retention purge error', { reportId: r.id, err: (e as any)?.message || e });
      }
    }
  }
}

