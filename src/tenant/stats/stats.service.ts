import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';

type CacheEntry = { data: any; expiresAt: number };

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaTenantService) {}

  private cache = new Map<string, CacheEntry>();

  private ttlMs() {
    const min = 5, max = 15;
    const minutes = parseInt(process.env.STATS_CACHE_MINUTES || '10', 10);
    const m = Math.min(Math.max(isNaN(minutes) ? 10 : minutes, min), max);
    return m * 60 * 1000;
  }

  async getStats(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const now = Date.now();
    const hit = this.cache.get(clientId);
    if (hit && hit.expiresAt > now) return hit.data;

    const reports = await this.prisma.whistleReport.count({ where: { clientId } });
    const open = await this.prisma.whistleReport.count({ where: { clientId, status: 'OPEN' as any } });

    const closed = await this.prisma.whistleReport.findMany({
      where: { clientId, finalClosedAt: { not: null } },
      select: { createdAt: true, finalClosedAt: true },
    });
    const avgDaysToClose = closed.length
      ? Math.round(
          closed.reduce((s, r) => s + ((r.finalClosedAt!.getTime() - r.createdAt.getTime()) / 86400000), 0) /
            closed.length,
        )
      : 0;

    const ack = await this.prisma.whistleReport.findMany({
      where: { clientId, acknowledgeAt: { not: null } },
      select: { createdAt: true, acknowledgeAt: true },
    });
    const avgDaysToReceive = ack.length
      ? Math.round(
          ack.reduce((s, r) => s + ((r.acknowledgeAt!.getTime() - r.createdAt.getTime()) / 86400000), 0) / ack.length,
        )
      : 0;

    const byMonth = await this.prisma.$queryRawUnsafe<{ date: string; count: number }[]>(
      `select to_char(date_trunc('month', "createdAt"), 'YYYY-MM') as date, count(*)::int as count from "WhistleReport" where "clientId" = $1 group by 1 order by 1`,
      clientId,
    );

    const bySourceRaw = await (this.prisma.whistleReport as any).groupBy({
      by: ['channel'],
      where: { clientId },
      _count: { _all: true },
    });
    const bySource = (bySourceRaw || []).map((x: any) => ({ name: x.channel, value: x._count._all }));

    const byDepartmentRaw = await (this.prisma.whistleReport as any).groupBy({
      by: ['departmentId'],
      where: { clientId },
      _count: { _all: true },
    });
    const byDepartment = (byDepartmentRaw || []).map((x: any) => ({ name: x.departmentId, value: x._count._all }));

    const data = {
      kpis: { reports, avgDaysToReceive, avgDaysToClose, open },
      byMonth,
      bySource,
      byDepartment,
      statusOverTime: [],
    };

    this.cache.set(clientId, { data, expiresAt: now + this.ttlMs() });
    return data;
  }
}

