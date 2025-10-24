import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaTenantService) {}

  async getProfile(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const profile = await (this.prisma as any).billingProfile.findUnique({ where: { clientId } });
    return (
      profile || {
        companyName: '',
        taxId: '',
        address: '',
        zip: '',
        city: '',
        province: '',
        country: '',
        billingEmail: '',
      }
    );
  }

  async updateProfile(clientId: string, body: any) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const data: any = {};
    for (const k of ['companyName', 'taxId', 'address', 'zip', 'city', 'province', 'country', 'billingEmail']) {
      if (typeof body?.[k] === 'string') data[k] = body[k];
    }
    const res = await (this.prisma as any).billingProfile.upsert({ where: { clientId }, update: data, create: { clientId, ...data } });
    return res;
  }

  async getSubscription(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const sub = await (this.prisma as any).subscription.findFirst({ where: { clientId }, orderBy: { createdAt: 'desc' } });
    if (!sub) return { plan: 'BASIC', cycle: 'MENSILE', status: 'ACTIVE' };
    return { plan: 'BASIC', cycle: sub.billingCycle, status: sub.status, startsAt: sub.startsAt, nextBillingAt: sub.nextBillingAt };
  }

  async updateSubscription(clientId: string, body: any) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const existing = await (this.prisma as any).subscription.findFirst({ where: { clientId }, orderBy: { createdAt: 'desc' } });
    const data: any = {};
    if (typeof body?.cycle === 'string') data.billingCycle = body.cycle as any;
    if (typeof body?.status === 'string') data.status = body.status as any;
    if (existing) {
      return (this.prisma as any).subscription.update({ where: { id: existing.id }, data });
    } else {
      return (this.prisma as any).subscription.create({ data: { clientId, billingCycle: (data.billingCycle || 'MENSILE') as any, contractTerm: 'ONE_YEAR' as any, status: (data.status || 'ACTIVE') as any } });
    }
  }

  async getPaymentMethod(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const pm = await (this.prisma as any).paymentMethod.findUnique({ where: { clientId } });
    return pm || { type: 'CARTA', masked: '**** **** **** 1234' };
  }

  async updatePaymentMethod(clientId: string, body: any) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const type = typeof body?.type === 'string' ? body.type : 'CARTA';
    const masked = typeof body?.masked === 'string' ? body.masked : '**** **** **** 1234';
    return (this.prisma as any).paymentMethod.upsert({ where: { clientId }, update: { type, masked }, create: { clientId, type, masked } });
  }
}

