import { CanActivate, ExecutionContext, Injectable, BadRequestException } from '@nestjs/common';
import { Request } from 'express';

function parseAllowlist(env?: string): string[] {
  return (env || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = (req.headers['x-tenant-id'] as string | undefined)?.trim();

    if (!header) {
      // In public endpoints questo header è obbligatorio (iniettato da proxy)
      throw new BadRequestException('Richiesta non valida');
    }

    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    const allowlist = parseAllowlist(process.env.TENANT_ID_ALLOWLIST);

    if (isProd && allowlist.length > 0 && !allowlist.includes(header)) {
      // Log sintetico senza echo dell'ID
      // eslint-disable-next-line no-console
      console.warn('Tenant header rejected');
      throw new BadRequestException('Richiesta non valida');
    }

    (req as any).tenantId = header.toString().toLowerCase();
    return true;
  }
}

