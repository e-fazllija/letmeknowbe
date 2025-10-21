import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';

function parseDays(csv: string | undefined, def: number[]): number[] {
  const s = (csv || '').trim();
  if (!s) return def;
  return s
    .split(',')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

@Injectable()
export class ReportSlaScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaTenantService) {}

  onModuleInit() {
    const enabled = ((process.env.SLA_REMINDER_ENABLED || '').toLowerCase() === 'true') || process.env.SLA_REMINDER_ENABLED === '1';
    if (!enabled) return;
    const intervalMs = parseInt(process.env.SLA_TIMER_MS || '', 10);
    const every = !isNaN(intervalMs) && intervalMs > 0 ? intervalMs : 24 * 60 * 60 * 1000; // default: daily
    // eslint-disable-next-line no-console
    console.info('SLA reminder scheduler enabled', { everyMs: every });
    this.timer = setInterval(() => {
      this.run().catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('SLA reminder scheduler error', e?.message || e);
      });
    }, every);
    // run once on boot (optional)
    this.run().catch(() => {});
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    const now = new Date();
    await this.remindAck(now);
    await this.remindResponse(now);
  }

  private async remindAck(now: Date) {
    const days = parseDays(process.env.ACK_REMIND_DAYS, [2, 3, 7]);
    if (days.length === 0) return;
    for (const d of days) {
      const cutoff = addDays(now, -d);
      const candidates = await this.prisma.whistleReport.findMany({
        where: {
          acknowledgeAt: null,
          createdAt: { lte: cutoff },
          status: { in: ['OPEN', 'IN_PROGRESS', 'NEED_INFO'] as any },
        },
        select: { id: true, clientId: true },
      });
      for (const r of candidates) {
        const marker = `SLA_ACK_REMINDER_D${d}`;
        const exists = await this.prisma.reportMessage.findFirst({ where: { reportId: r.id, visibility: 'SYSTEM' as any, note: marker } });
        if (exists) continue;
        await this.prisma.reportMessage.create({
          data: {
            clientId: r.clientId,
            reportId: r.id,
            author: 'system',
            body: `Promemoria: inviare ricevuta al segnalante (<= ${d} giorni).`,
            note: marker,
            visibility: 'SYSTEM' as any,
          },
        });
      }
    }
  }

  private async remindResponse(now: Date) {
    const responseTtl = parseInt(process.env.RESPONSE_TTL_DAYS || '90', 10) || 90;
    const days = parseDays(process.env.RESPONSE_REMIND_DAYS, [30, 60, 80, 90]);
    if (days.length === 0) return;
    const candidates = await this.prisma.whistleReport.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS', 'NEED_INFO'] as any },
      },
      select: { id: true, clientId: true, createdAt: true, acknowledgeAt: true, dueAt: true },
    });
    for (const r of candidates) {
      const base = r.acknowledgeAt || r.createdAt;
      const dueAt = r.dueAt || addDays(base, responseTtl);
      for (const d of days) {
        const when = addDays(base, d);
        if (now >= when) {
          const marker = `SLA_RESPONSE_REMINDER_D${d}`;
          const exists = await this.prisma.reportMessage.findFirst({ where: { reportId: r.id, visibility: 'SYSTEM' as any, note: marker } });
          if (!exists) {
            await this.prisma.reportMessage.create({
              data: {
                clientId: r.clientId,
                reportId: r.id,
                author: 'system',
                body: `Promemoria: fornire riscontro entro ${responseTtl} giorni (tappa ${d} giorni).`,
                note: marker,
                visibility: 'SYSTEM' as any,
              },
            });
          }
        }
      }
      if (now > dueAt) {
        const over = await this.prisma.reportMessage.findFirst({ where: { reportId: r.id, visibility: 'SYSTEM' as any, note: 'SLA_OVERDUE' } });
        if (!over) {
          await this.prisma.reportMessage.create({
            data: {
              clientId: r.clientId,
              reportId: r.id,
              author: 'system',
              body: 'SLA superato: riscontro oltre la scadenza prevista.',
              note: 'SLA_OVERDUE',
              visibility: 'SYSTEM' as any,
            },
          });
        }
      }
    }
  }
}

