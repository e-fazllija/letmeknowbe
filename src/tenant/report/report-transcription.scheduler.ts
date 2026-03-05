import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';

const AUDIO_MIME = new Set(['audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg']);

function isTrue(v?: string) { return v === '1' || (v || '').toLowerCase() === 'true'; }

@Injectable()
export class ReportTranscriptionScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaTenantService) {}

  onModuleInit() {
    if (!isTrue(process.env.TRANSCRIBE_ENABLED)) return;
    const intervalMs = parseInt(process.env.TRANSCRIBE_TIMER_MS || '', 10);
    const every = !isNaN(intervalMs) && intervalMs > 0 ? intervalMs : 5 * 60 * 1000; // default: 5 min
    // eslint-disable-next-line no-console
    console.info('Transcription scheduler enabled', { everyMs: every, engine: process.env.TRANSCRIBE_ENGINE || 'MOCK' });
    this.timer = setInterval(() => {
      this.run().catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('Transcription scheduler error', e?.message || e);
      });
    }, every);
    // run once on boot (optional)
    this.run().catch(() => {});
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    const engine = (process.env.TRANSCRIBE_ENGINE || 'MOCK').toUpperCase();
    // Find candidate reports: have audio attachments, no DONE/ERROR markers yet
    const candidates = await this.prisma.whistleReport.findMany({
      where: {
        attachments: { some: { mimeType: { in: Array.from(AUDIO_MIME) as any } } },
      },
      select: { id: true, clientId: true },
      take: 50,
    });

    for (const r of candidates) {
      const done = await this.prisma.reportMessage.findFirst({ where: { reportId: r.id, visibility: 'SYSTEM' as any, note: 'TRANSCRIPT_DONE' } });
      const error = await this.prisma.reportMessage.findFirst({ where: { reportId: r.id, visibility: 'SYSTEM' as any, note: 'TRANSCRIPT_ERROR' } });
      if (done || error) continue;

      if (engine === 'MOCK') {
        await this.handleMock(r.id, r.clientId);
        continue;
      }

      if (engine === 'WHISPER_LOCAL') {
        const url = process.env.WHISPER_URL || '';
        if (!url) {
          // eslint-disable-next-line no-console
          console.info('WHISPER_LOCAL configured but WHISPER_URL missing; skipping', { reportId: r.id });
          continue;
        }
        // Placeholder: integrazione reale con storage e chiamata HTTP verrà aggiunta in seguito
        // Per ora, non fare nulla (ambiente pronto per collegare il microservizio)
        continue;
      }
    }
  }

  private async handleMock(reportId: string, clientId: string) {
    const exists = await this.prisma.reportMessage.findFirst({ where: { reportId, visibility: 'INTERNAL' as any, note: 'Trascrizione audio' } });
    if (!exists) {
      await this.prisma.reportMessage.create({
        data: {
          clientId,
          reportId,
          author: 'system',
          body: 'Trascrizione (mock): allegato audio presente. Sostituire con STT reale (Whisper).',
          note: 'Trascrizione audio',
          visibility: 'INTERNAL' as any,
        },
      });
    }
    await this.prisma.reportMessage.create({
      data: {
        clientId,
        reportId,
        author: 'system',
        body: 'Trascrizione completata (mock).',
        note: 'TRANSCRIPT_DONE',
        visibility: 'SYSTEM' as any,
      },
    });
    // eslint-disable-next-line no-console
    console.info('Transcription mock done', { reportId });
  }
}

