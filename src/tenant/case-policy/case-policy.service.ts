import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';

@Injectable()
export class CasePolicyService {
  constructor(private prisma: PrismaTenantService) {}

  async getOrCreate(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const existing = await (this.prisma as any).casePolicy.findUnique({ where: { clientId } });
    if (existing) return existing;
    return (this.prisma as any).casePolicy.create({
      data: {
        clientId,
        restrictVisibility: false,
        allowMentions: true,
        redactPii: false,
        allowAttachments: true,
        publicShowGlobalLookups: true,
        publicShowTenantLookups: true,
        publicLookupPreference: 'PREFER_TENANT',
      },
    });
  }

  async upsert(clientId: string, body: any) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const data: any = {};
    if (typeof body?.restrictVisibility === 'boolean') data.restrictVisibility = body.restrictVisibility;
    if (typeof body?.allowMentions === 'boolean') data.allowMentions = body.allowMentions;
    if (typeof body?.redactPii === 'boolean') data.redactPii = body.redactPii;
    if (typeof body?.allowAttachments === 'boolean') data.allowAttachments = body.allowAttachments;
    if (typeof body?.publicShowGlobalLookups === 'boolean') data.publicShowGlobalLookups = body.publicShowGlobalLookups;
    if (typeof body?.publicShowTenantLookups === 'boolean') data.publicShowTenantLookups = body.publicShowTenantLookups;
    if (typeof body?.publicLookupPreference === 'string') {
      const v = String(body.publicLookupPreference).toUpperCase();
      if (v === 'PREFER_TENANT' || v === 'PREFER_GLOBAL' || v === 'SHOW_ALL') data.publicLookupPreference = v;
    }
    return (this.prisma as any).casePolicy.upsert({
      where: { clientId },
      update: data,
      create: {
        clientId,
        restrictVisibility: false,
        allowMentions: true,
        redactPii: false,
        allowAttachments: true,
        publicShowGlobalLookups: true,
        publicShowTenantLookups: true,
        publicLookupPreference: 'PREFER_TENANT',
        ...data,
      },
    });
  }
}

