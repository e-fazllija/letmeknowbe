import { Injectable, Logger } from '@nestjs/common';
import { PrismaPublicService } from '../../public/prisma-public.service';
import { RetentionPerTenantService } from './retention-per-tenant.service';

function isTrue(v?: string) { return v === '1' || (v || '').toLowerCase() === 'true'; }

function parseTenantAllowlist(): string[] {
  const raw = process.env.TENANT_ID_ALLOWLIST || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => !!s);
}

function daysFromEnv(): number {
  const d = parseInt(process.env.DATA_RETENTION_DAYS || '', 10);
  if (!isNaN(d) && d > 0) return d;
  const y = parseInt(process.env.DATA_RETENTION_YEARS || '5', 10);
  const years = isNaN(y) || y <= 0 ? 5 : y;
  return years * 365;
}

@Injectable()
export class RetentionOrchestratorService {
  private readonly logger = new Logger(RetentionOrchestratorService.name);

  constructor(
    private readonly publicPrisma: PrismaPublicService,
    private readonly retentionPerTenant: RetentionPerTenantService,
  ) {}

  async runOnceGlobal(): Promise<void> {
    const allowlist = parseTenantAllowlist();
    const tenants = await (this.publicPrisma as any).client.findMany({
      where: {
        ...(allowlist.length > 0 ? { id: { in: allowlist } } : {}),
        status: { not: 'ARCHIVED' as any },
      },
      select: { id: true, companyName: true },
    });

    const now = new Date();
    const retentionDays = daysFromEnv();
    const batch = parseInt(process.env.RETENTION_BATCH || '50', 10) || 50;
    const dryRun = isTrue(process.env.RETENTION_DRY_RUN);
    const bucketTmp = process.env.S3_BUCKET_TMP || '';
    const bucketAttach = process.env.S3_BUCKET_ATTACH || '';

    let deletedTotal = 0;

    for (const t of tenants) {
      try {
        deletedTotal += await this.retentionPerTenant.runOnceForTenant({
          now,
          clientId: t.id,
          retentionDays,
          batch,
          dryRun,
          bucketTmp,
          bucketAttach,
        });
      } catch (err: any) {
        this.logger.error(`Retention run failed for tenant ${t.companyName || t.id}`, err?.stack || err);
      }
    }

    this.logger.log(`RETENTION_RUN_OK tenants=${tenants.length} deleted=${deletedTotal} dryRun=${dryRun}`);
  }
}
