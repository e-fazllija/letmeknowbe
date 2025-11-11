import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

function stripQuery(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

export function normalizeRoute(path: string): string {
  try {
    return stripQuery(path || '').replace(/\/+/g, '/');
  } catch {
    return path;
  }
}

@Injectable()
export class AuditorAllowlistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const role = ((req?.user?.role as string) || '').toUpperCase();
    // If not authenticated yet or not an auditor, do not enforce here.
    if (role !== 'AUDITOR') return true;

    const method = (req?.method || 'GET').toUpperCase();
    const path = normalizeRoute(req?.originalUrl || req?.url || '');

    // Global prefix `/v1` is included in originalUrl
    const allow: Array<{ m: string; r: RegExp }> = [
      { m: 'GET', r: /^\/v1\/tenant\/reports$/ },
      { m: 'GET', r: /^\/v1\/tenant\/reports\/[^/]+$/ },
      { m: 'GET', r: /^\/v1\/tenant\/reports\/[^/]+\/messages$/ },
      { m: 'GET', r: /^\/v1\/tenant\/reports\/[^/]+\/logs$/ },
      { m: 'GET', r: /^\/v1\/tenant\/attachments\/[^/]+\/preview$/ },
      { m: 'GET', r: /^\/v1\/tenant\/reports\/[^/]+\/attachments\/[^/]+\/preview$/ },
    ];

    const ok = allow.some((a) => a.m === method && a.r.test(path));
    if (!ok) throw new ForbiddenException('Not allowed for AUDITOR');
    return true;
  }
}
