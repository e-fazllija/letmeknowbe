import { Injectable, Logger } from '@nestjs/common';
import { PrismaPublicService } from '../../public/prisma-public.service';
import { SlaPerTenantService } from './sla-per-tenant.service';

function parseTenantAllowlist(): string[] {
  const raw = process.env.TENANT_ID_ALLOWLIST || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => !!s);
}

@Injectable()
export class SlaOrchestratorService {
  private readonly logger = new Logger(SlaOrchestratorService.name);

  constructor(
    private readonly publicPrisma: PrismaPublicService,
    private readonly slaPerTenant: SlaPerTenantService,
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
    let totalMessages = 0;

    for (const t of tenants) {
      try {
        totalMessages += await this.slaPerTenant.runOnceForTenant(now, t.id);
      } catch (err: any) {
        this.logger.error(`SLA run failed for tenant ${t.companyName || t.id}`, err?.stack || err);
      }
    }

    this.logger.log(`SLA_RUN_OK tenants=${tenants.length} messages=${totalMessages}`);
  }
}
