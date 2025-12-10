import { Injectable } from '@nestjs/common';
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
export class SlaPerTenantService {
  constructor(private readonly prisma: PrismaTenantService) {}

  /**
   * Esegue i promemoria SLA per un singolo tenant.
   * Ritorna il numero di messaggi creati.
   */
  async runOnceForTenant(now: Date, clientId: string): Promise<number> {
    let created = 0;
    created += await this.ensurePublicReceipt(now, clientId);
    created += await this.remindAck(now, clientId);
    created += await this.remindResponse(now, clientId);
    return created;
  }

  private async remindAck(now: Date, clientId: string): Promise<number> {
    const days = parseDays(process.env.ACK_REMIND_DAYS, [2, 3, 7]);
    if (days.length === 0) return 0;
    let created = 0;
    for (const d of days) {
      const cutoff = addDays(now, -d);
      const candidates = await this.prisma.whistleReport.findMany({
        where: {
          clientId,
          acknowledgeAt: null,
          createdAt: { lte: cutoff },
          status: { in: ['OPEN', 'IN_PROGRESS', 'NEED_INFO'] as any },
        },
        select: { id: true, clientId: true },
      });
      for (const r of candidates) {
        const marker = `SLA_ACK_REMINDER_D${d}`;
        const exists = await this.prisma.reportMessage.findFirst({
          where: { reportId: r.id, visibility: 'SYSTEM' as any, note: marker },
        });
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
        created += 1;
      }
    }
    return created;
  }

  private async remindResponse(now: Date, clientId: string): Promise<number> {
    const responseTtl = parseInt(process.env.RESPONSE_TTL_DAYS || '90', 10) || 90;
    const days = parseDays(process.env.RESPONSE_REMIND_DAYS, [30, 60, 80, 90]);
    if (days.length === 0) return 0;
    let created = 0;
    const candidates = await this.prisma.whistleReport.findMany({
      where: {
        clientId,
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
          const exists = await this.prisma.reportMessage.findFirst({
            where: { reportId: r.id, visibility: 'SYSTEM' as any, note: marker },
          });
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
            created += 1;
          }
        }
      }
      if (now > dueAt) {
        const over = await this.prisma.reportMessage.findFirst({
          where: { reportId: r.id, visibility: 'SYSTEM' as any, note: 'SLA_OVERDUE' },
        });
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
          created += 1;
        }
      }
    }
    return created;
  }

  // Garantisce una ricevuta PUBLIC entro X giorni se assente
  private async ensurePublicReceipt(now: Date, clientId: string): Promise<number> {
    const ttlDays = parseInt(process.env.PUBLIC_ACK_TTL_DAYS || process.env.ACK_TTL_DAYS || '7', 10) || 7;
    const cutoff = addDays(now, -ttlDays);
    const candidates = await this.prisma.whistleReport.findMany({
      where: {
        clientId,
        createdAt: { lte: cutoff },
        status: { in: ['OPEN', 'IN_PROGRESS', 'NEED_INFO', 'SUSPENDED'] as any },
      },
      select: { id: true, clientId: true },
    });
    let created = 0;
    for (const r of candidates) {
      const exists = await this.prisma.reportMessage.findFirst({
        where: { reportId: r.id, visibility: 'PUBLIC' as any, note: 'PUBLIC_RECEIPT' },
      });
      if (exists) continue;
      await this.prisma.reportMessage.create({
        data: {
          clientId: r.clientId,
          reportId: r.id,
          author: 'AGENTE',
          body: 'Ricevuta: abbiamo preso in carico la tua segnalazione.',
          note: 'PUBLIC_RECEIPT',
          visibility: 'PUBLIC' as any,
        },
      });
      created += 1;
    }
    return created;
  }
}
