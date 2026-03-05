import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaTenantService } from '../../tenant/prisma-tenant.service';
import { SubscriptionStatus } from '../../generated/tenant';

function normalizePath(url: string | undefined): string {
  if (!url) return '';
  try {
    const base = url.split('?')[0] || '';
    return base.replace(/\/+/, '/');
  } catch {
    return url || '';
  }
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaTenantService) {}

  private shouldSkip(req: Request): boolean {
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS' || method === 'HEAD') return true;
    const path = normalizePath(req.originalUrl || req.url || '');

    // Scope to tenant APIs only
    if (!path.startsWith('/v1/tenant')) return true;

    // Allow auth flows and billing endpoints
    if (path.startsWith('/v1/tenant/auth')) return true;
    if (path.startsWith('/v1/tenant/billing')) return true;

    // Health endpoints
    if (path.startsWith('/v1/health')) return true;

    return false;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    if (this.shouldSkip(req)) return true;

    const user: any = (req as any).user;
    const clientId = user?.clientId as string | undefined;
    if (!clientId) return true; // let route guards handle auth

    // Fast-path: prova a usare i claim nel token (subStatus/subEndsAt)
    const rawStatus = (user?.subStatus as string | undefined) || undefined;
    const status = rawStatus ? rawStatus.toUpperCase() : undefined;
    const rawEndsAt = user?.subEndsAt;
    const endsAtSec = typeof rawEndsAt === 'number' ? rawEndsAt : undefined;

    if (status) {
      const active = status === 'ACTIVE' || status === 'TRIALING';
      const nowSec = Math.floor(Date.now() / 1000);
      const notExpired = endsAtSec === undefined || endsAtSec > nowSec;
      if (!active || !notExpired) {
        throw new ForbiddenException('Abbonamento scaduto o inattivo');
      }
      // Token dice che la sottoscrizione è ok: accetta senza query DB
      return true;
    }

    // Fallback: controlla dal DB (per token vecchi o senza claim)
    const now = new Date();
    const sub = await (this.prisma as any).subscription.findFirst({
      where: {
        clientId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!sub) {
      throw new ForbiddenException('Abbonamento scaduto o inattivo');
    }

    return true;
  }
}
