import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobLockService } from '../../common/job-lock.service';
import { RetentionOrchestratorService } from './retention-orchestrator.service';

function isTrue(v?: string) { return v === '1' || (v || '').toLowerCase() === 'true'; }

@Injectable()
export class ReportRetentionScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private intervalMs = 24 * 60 * 60 * 1000;

  constructor(
    private jobLock: JobLockService,
    private retentionOrchestrator: RetentionOrchestratorService,
  ) {}

  onModuleInit() {
    const enabled = isTrue(process.env.RETENTION_ENABLED);
    if (!enabled) return;
    const every = parseInt(process.env.RETENTION_TIMER_MS || '', 10);
    this.intervalMs = !isNaN(every) && every > 0 ? every : 24 * 60 * 60 * 1000; // daily
    // eslint-disable-next-line no-console
    console.info('Report retention scheduler enabled', { intervalMs: this.intervalMs });
    const runner = () => {
      this.runSafely().catch((e) => {
        try { console.warn('Retention error', e?.message || e); } catch {}
      });
    };
    this.timer = setInterval(runner, this.intervalMs);
    runner();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async runSafely() {
    const ttl = Math.max(this.intervalMs * 2, 5 * 60 * 1000);
    const acquired = await this.jobLock.tryAcquire('RETENTION_PURGE', ttl);
    if (!acquired) return;
    try {
      await this.retentionOrchestrator.runOnceGlobal();
    } finally {
      await this.jobLock.release('RETENTION_PURGE');
    }
  }
}
