import { Injectable } from '@nestjs/common';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';

function isTrue(v?: string) {
  return v === '1' || String(v || '').toLowerCase() === 'true';
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaTenantService) {}

  private frontendBase(): string | undefined {
    const base = (process.env.FRONTEND_BASE_URL || '').trim();
    if (!base) return undefined;
    return base.replace(/\/$/, '');
  }

  private async resolveAdminEmails(tenantId: string): Promise<string[]> {
    try {
      const users = await this.prisma.internalUser.findMany({
        where: {
          clientId: tenantId,
          role: 'ADMIN' as any,
          status: 'ACTIVE' as any,
          email: { contains: '@' },
        },
        select: { email: true },
      });
      const emails = (users || []).map((u) => (u?.email || '').trim()).filter(Boolean);
      return Array.from(new Set(emails));
    } catch {
      return [];
    }
  }

  private async resolveTenantName(tenantId: string): Promise<string | undefined> {
    try {
      const c = await this.prisma.client.findUnique({ where: { id: tenantId }, select: { companyName: true } });
      return c?.companyName || undefined;
    } catch {
      return undefined;
    }
  }

  private async resolveUserEmail(tenantId: string, userId: string): Promise<string | undefined> {
    try {
      const u = await this.prisma.internalUser.findFirst({
        where: { id: userId, clientId: tenantId, status: 'ACTIVE' as any, email: { contains: '@' } },
        select: { email: true },
      });
      const mail = (u?.email || '').trim();
      return mail || undefined;
    } catch {
      return undefined;
    }
  }

  private async deliver(to: string[], subject: string, text: string, html?: string): Promise<void> {
    const host = (process.env.SMTP_HOST || '').trim();
    const portRaw = process.env.SMTP_PORT || '';
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
    const user = (process.env.SMTP_USER || '').trim();
    const pass = (process.env.SMTP_PASS || '').trim();
    const from = (process.env.SMTP_FROM || 'LetMeKnow <no-reply@local>').trim();

    if (!host) {
      // Dev console driver
      // eslint-disable-next-line no-console
      console.info('[notify] console driver', { to, subject, text });
      return;
    }

    try {
      const port = parseInt(portRaw || '25', 10) || 25;
      // Require nodemailer only when SMTP is configured to avoid dev dependency
      let transporter: any;
      try {
        // Use dynamic require via eval to avoid TS static module resolution
        const req = (eval('require') as any);
        const nm = req ? req('nodemailer') : null;
        const createTransport = nm?.createTransport || nm?.default?.createTransport;
        if (typeof createTransport !== 'function') throw new Error('nodemailer not available');
        transporter = createTransport({
          host,
          port,
          secure,
          auth: user && pass ? { user, pass } : undefined,
        } as any);
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.warn('[notify] SMTP configured but nodemailer not installed; falling back to console', { err: e?.message || e });
        // Dev fallback to console if nodemailer missing
        console.info('[notify] console driver', { to, subject, text });
        return;
      }
      await transporter.sendMail({ from, to: to.join(','), subject, text, html });
      // eslint-disable-next-line no-console
      console.info('[notify] sent', { toCount: to.length });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('[notify] send failed', { err: e?.message || e });
    }
  }

  async notifyNewPublicReport(tenantId: string, reportId: string): Promise<void> {
    if (!isTrue(process.env.NOTIFY_ON_NEW_PUBLIC_REPORT)) return;

    const to = await this.resolveAdminEmails(tenantId);
    if (!to.length) return;

    const tenantName = await this.resolveTenantName(tenantId);
    const base = this.frontendBase();
    const link = base ? `${base}/#/reports/${reportId}` : undefined;
    const when = new Date().toISOString();
    const subject = `Nuova segnalazione ricevuta — ${tenantName || tenantId}`;
    const textLines = [
      `Tenant: ${tenantName || tenantId}`,
      `Report ID: ${reportId}`,
      `Ricevuta alle: ${when}`,
      link ? `Apri: ${link}` : 'Configura FRONTEND_BASE_URL per includere il link al caso.',
    ];
    await this.deliver(to, subject, textLines.join('\n'));
  }

  async notifyNewPublicVoiceReport(tenantId: string, reportId: string): Promise<void> {
    if (!isTrue(process.env.NOTIFY_ON_NEW_PUBLIC_VOICE)) return;

    const to = await this.resolveAdminEmails(tenantId);
    if (!to.length) return;

    const tenantName = await this.resolveTenantName(tenantId);
    const base = this.frontendBase();
    const link = base ? `${base}/#/reports/${reportId}` : undefined;
    const when = new Date().toISOString();
    const subject = `Nuova segnalazione vocale — ${tenantName || tenantId}`;
    const textLines = [
      `Tenant: ${tenantName || tenantId}`,
      `Report ID: ${reportId}`,
      `Ricevuta alle: ${when}`,
      link ? `Apri: ${link}` : 'Configura FRONTEND_BASE_URL per includere il link al caso.',
    ];
    await this.deliver(to, subject, textLines.join('\n'));
  }

  async notifyAssignment(tenantId: string, reportId: string, assigneeUserId: string, opts?: { byUserId?: string }): Promise<void> {
    if (!isTrue(process.env.NOTIFY_ON_ASSIGN)) return;
    const toEmail = await this.resolveUserEmail(tenantId, assigneeUserId);
    if (!toEmail) return;
    const tenantName = await this.resolveTenantName(tenantId);
    const base = this.frontendBase();
    const link = base ? `${base}/#/reports/${reportId}` : undefined;
    let byLine = '';
    try {
      const byId = opts?.byUserId || '';
      if (byId) {
        const byEmail = await this.resolveUserEmail(tenantId, byId);
        if (byEmail) byLine = `Assegnato da: ${byEmail}`;
      }
    } catch {}
    const subject = `Caso assegnato — ${tenantName || tenantId}`;
    const textLines = [
      `Tenant: ${tenantName || tenantId}`,
      `Report ID: ${reportId}`,
      link ? `Apri: ${link}` : 'Configura FRONTEND_BASE_URL per includere il link al caso.',
      byLine,
    ].filter(Boolean) as string[];
    await this.deliver([toEmail], subject, textLines.join('\n'));
  }
}
