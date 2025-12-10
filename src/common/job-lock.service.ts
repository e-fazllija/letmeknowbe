import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaPublicService } from '../public/prisma-public.service';

/**
 * Lock distribuito su tabella job_lock (public DB) per serializzare i job
 * schedulati in ambienti multi-istanza.
 */
@Injectable()
export class JobLockService {
  private readonly instanceId =
    process.env.HOSTNAME || process.env.WEBSITE_INSTANCE_ID || `instance-${randomUUID()}`;

  constructor(private readonly prisma: PrismaPublicService) {}

  private normalizeTtl(ttlMs?: number) {
    const ttl = typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : 60_000;
    return Math.max(ttl, 1_000);
  }

  async tryAcquire(jobName: string, ttlMs?: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.normalizeTtl(ttlMs));

    try {
      const acquired = await (this.prisma as any).$transaction(async (tx: any) => {
        // Garantisce l'esistenza della riga
        await (tx as any).jobLock.upsert({
          where: { jobName },
          update: {},
          create: { jobName, lockedUntil: null, owner: null },
        });

        const res = await (tx as any).jobLock.updateMany({
          where: {
            jobName,
            OR: [
              { lockedUntil: null },
              { lockedUntil: { lt: now } },
              { owner: this.instanceId },
            ],
          },
          data: { lockedUntil: expiresAt, owner: this.instanceId },
        });

        return res.count === 1;
      });

      return !!acquired;
    } catch {
      return false;
    }
  }

  async release(jobName: string): Promise<void> {
    try {
      await (this.prisma as any).jobLock.updateMany({
        where: { jobName, owner: this.instanceId },
        data: { lockedUntil: new Date() },
      });
    } catch {
      // best-effort
    }
  }
}
