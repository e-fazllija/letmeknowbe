import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobLockService } from '../../common/job-lock.service';
import { SlaOrchestratorService } from './sla-orchestrator.service';

@Injectable()
export class ReportSlaScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private intervalMs = 24 * 60 * 60 * 1000;

  constructor(
    private jobLock: JobLockService,
    private slaOrchestrator: SlaOrchestratorService,
  ) {}

  onModuleInit() {
    const enabled = ((process.env.SLA_REMINDER_ENABLED || '').toLowerCase() === 'true') || process.env.SLA_REMINDER_ENABLED === '1';
    if (!enabled) return;
    const configured = parseInt(process.env.SLA_TIMER_MS || '', 10);
    this.intervalMs = !isNaN(configured) && configured > 0 ? configured : 24 * 60 * 60 * 1000; // default: daily
    // eslint-disable-next-line no-console
    console.info('SLA reminder scheduler enabled', { everyMs: this.intervalMs });
    const runner = () => {
      this.runSafely().catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('SLA reminder scheduler error', e?.message || e);
      });
    };
    this.timer = setInterval(runner, this.intervalMs);
    // run once on boot (optional)
    runner();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafely() {
    const ttl = Math.max(this.intervalMs * 2, 5 * 60 * 1000);
    const acquired = await this.jobLock.tryAcquire('SLA_REMINDER', ttl);
    if (!acquired) return;
    try {
      await this.slaOrchestrator.runOnceGlobal();
    } finally {
      await this.jobLock.release('SLA_REMINDER');
    }
  }
}
