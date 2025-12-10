import { Injectable } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { S3StorageService } from '../../storage/s3-storage.service';

function isTrue(v?: string) { return v === '1' || (v || '').toLowerCase() === 'true'; }

@Injectable()
export class RetentionPerTenantService {
  constructor(
    private readonly prisma: PrismaTenantService,
    private readonly storage: S3StorageService,
  ) {}

  /**
   * Esegue la retention per un singolo tenant. Ritorna il numero di report cancellati (o toccati in dry-run).
   */
  async runOnceForTenant(params: {
    now: Date;
    clientId: string;
    retentionDays: number;
    batch: number;
    dryRun: boolean;
    bucketTmp: string;
    bucketAttach: string;
  }): Promise<number> {
    const { now, clientId, retentionDays, batch, dryRun, bucketTmp, bucketAttach } = params;

    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.whistleReport.findMany({
      where: {
        clientId,
        OR: [
          { retentionAt: { lte: now } },
          { AND: [{ retentionAt: null }, { createdAt: { lte: cutoff } }] },
        ],
      },
      select: { id: true, clientId: true },
      take: batch,
    });

    if (candidates.length === 0) return 0;

    let deleted = 0;

    for (const r of candidates) {
      try {
        if (dryRun) {
          // eslint-disable-next-line no-console
          console.info('Retention dry-run: would purge report', { reportId: r.id, clientId });
          const ra = new Date(now.getTime());
          await this.prisma.whistleReport.update({ where: { id: r.id }, data: { retentionAt: ra } });
          deleted += 1;
          continue;
        }

        // Delete S3 objects (best-effort)
        const atts = await this.prisma.reportAttachment.findMany({
          where: { reportId: r.id },
          select: { storageKey: true, finalKey: true },
        });
        for (const a of atts) {
          try { if (a.finalKey) await this.storage.deleteObject(bucketAttach, a.finalKey); } catch {}
          try { if (a.storageKey) await this.storage.deleteObject(bucketTmp, a.storageKey); } catch {}
        }

        // Remove PublicUser rows first (relation is not cascade)
        await this.prisma.publicUser.deleteMany({ where: { reportId: r.id } });

        // Cascade delete the report (attachments/messages/status/access logs cascade)
        await this.prisma.whistleReport.delete({ where: { id: r.id } });

        // Optionally add access log (best-effort)
        try {
          await (this.prisma as any).reportAccessLog.create({
            data: { reportId: r.id, clientId: r.clientId, action: 'RETENTION_PURGE', userId: null },
          });
        } catch {}

        deleted += 1;
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.warn('Retention purge error', { reportId: r.id, clientId, err: e?.message || e });
      }
    }

    return deleted;
  }
}
