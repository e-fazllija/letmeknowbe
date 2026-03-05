import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTenantService } from '../prisma-tenant.service';
import { PrismaPublicService } from '../../public/prisma-public.service';

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaTenantService,
    private prismaPublic: PrismaPublicService,
  ) {}

  async getProfile(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const client = await (this.prisma as any).client.findUnique({
      where: { id: clientId },
      select: {
        companyName: true,
        billingTaxId: true,
        billingAddressLine1: true,
        billingZip: true,
        billingCity: true,
        billingProvince: true,
        billingCountry: true,
        billingEmail: true,
        billingPec: true,
        billingSdiCode: true,
      },
    });
    if (!client) throw new NotFoundException('Tenant non trovato');

    return {
      companyName: client.companyName,
      taxId: client.billingTaxId,
      address: client.billingAddressLine1,
      zip: client.billingZip,
      city: client.billingCity,
      province: client.billingProvince,
      country: client.billingCountry,
      billingEmail: client.billingEmail,
      billingPec: client.billingPec ?? '',
      billingSdiCode: client.billingSdiCode ?? '',
    };
  }

  async updateProfile(clientId: string, body: any) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const data: any = {};

    if (typeof body?.companyName === 'string') data.companyName = body.companyName;
    if (typeof body?.taxId === 'string') data.billingTaxId = body.taxId;
    if (typeof body?.address === 'string') data.billingAddressLine1 = body.address;
    if (typeof body?.zip === 'string') data.billingZip = body.zip;
    if (typeof body?.city === 'string') data.billingCity = body.city;
    if (typeof body?.province === 'string') data.billingProvince = body.province;
    if (typeof body?.country === 'string') data.billingCountry = body.country;
    if (typeof body?.billingEmail === 'string') data.billingEmail = body.billingEmail;
    if (typeof body?.billingPec === 'string') data.billingPec = body.billingPec;
    if (typeof body?.billingSdiCode === 'string') data.billingSdiCode = body.billingSdiCode;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nessun dato di fatturazione valido fornito');
    }

    const tenantClient = await (this.prisma as any).client.update({
      where: { id: clientId },
      data,
    });

    // Mantiene allineato anche il PUBLIC (fonte per il superuser)
    try {
      await (this.prismaPublic as any).client.update({
        where: { id: clientId },
        data: {
          companyName: data.companyName ?? undefined,
          billingTaxId: data.billingTaxId ?? undefined,
          billingAddressLine1: data.billingAddressLine1 ?? undefined,
          billingZip: data.billingZip ?? undefined,
          billingCity: data.billingCity ?? undefined,
          billingProvince: data.billingProvince ?? undefined,
          billingCountry: data.billingCountry ?? undefined,
          billingEmail: data.billingEmail ?? undefined,
          billingPec: data.billingPec ?? undefined,
          billingSdiCode: data.billingSdiCode ?? undefined,
        },
      });
    } catch (e: any) {
      // Se non esiste il client in PUBLIC, falliamo per evitare divergenze
      throw new BadRequestException('Impossibile aggiornare i dati di fatturazione (PUBLIC non trovato)');
    }

    return tenantClient;
  }

  async getSubscription(clientId: string) {
    if (!clientId) {
      throw new BadRequestException('Tenant non valido');
    }

    // PUBLIC = fonte di verità per billing/subscription
    const sub = await (this.prismaPublic as any).subscription.findFirst({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (!sub) {
      return {
        id: undefined,
        plan: 'BASIC',
        cycle: 'ANNUALE',
        status: 'ACTIVE',
        installmentPlan: 'ONE_SHOT',
      };
    }

    return {
      id: sub.id,
      plan: sub.plan?.name || 'BASIC',
      cycle: sub.plan?.billingCycle || 'ANNUALE',
      status: sub.status,
      startsAt: sub.startsAt,
      nextBillingAt: sub.nextBillingAt,
      installmentPlan: sub.installmentPlan,
    };
  }

  /**
   * Ritorna uno snapshot sintetico dello stato billing/tenant
   * utile al FE per decidere se mostrare un lock di pagamento.
   */
  async getBillingStatus(clientId: string) {
    if (!clientId) {
      throw new BadRequestException('Tenant non valido');
    }

    const client = await (this.prisma as any).client.findUnique({
      where: { id: clientId },
      select: { status: true },
    });
    if (!client) {
      throw new NotFoundException('Tenant non trovato');
    }

    const lastPayment = await (this.prisma as any).payment.findFirst({
      where: { clientId },
      orderBy: [
        { paymentDate: 'desc' as any },
        { createdAt: 'desc' as any },
      ],
      select: { status: true },
    });

    const lastSub = await (this.prismaPublic as any).subscription.findFirst({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });

    const clientStatus = ((client.status as any) || '').toString();
    const subscriptionStatus = lastSub
      ? ((lastSub.status as any) || '').toString()
      : undefined;

    const billingLocked =
      clientStatus === 'PENDING_PAYMENT' || clientStatus === 'SUSPENDED';

    const lastPaymentStatus = (
      (lastPayment?.status as any) || ''
    )
      .toString()
      .toUpperCase();

    let lockMessage: string | undefined;
    if (clientStatus === 'PENDING_PAYMENT') {
      lockMessage =
        lastPaymentStatus === 'FAILED'
          ? 'Tenant in attesa di pagamento: l\'ultimo tentativo di pagamento è fallito. Completa il pagamento nella sezione fatturazione.'
          : 'Tenant in attesa di pagamento: completa il pagamento per continuare.';
    } else if (clientStatus === 'SUSPENDED') {
      lockMessage =
        'Tenant sospeso per mancato pagamento: aggiorna il metodo di pagamento per riattivare l\'accesso.';
    } else if (clientStatus === 'ARCHIVED') {
      lockMessage = 'Tenant archiviato: l\'account non è più attivo.';
    }

    return {
      clientStatus,
      subscriptionStatus,
      billingLocked,
      lockMessage,
      lastPaymentStatus: lastPaymentStatus || undefined,
    };
  }



  async updateSubscription(clientId: string, body: any) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const publicSub = await (this.prismaPublic as any).subscription.findFirst({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    if (!publicSub) {
      throw new BadRequestException('Nessuna subscription esistente per il tenant');
    }

    const tenantSub = await (this.prisma as any).subscription.findFirst({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });

    const data: any = {};
    if (typeof body?.status === 'string') data.status = body.status as any;

    const allowedPlans = ['ONE_SHOT', 'SEMESTRALE', 'TRIMESTRALE'];
    if (typeof body?.installmentPlan === 'string') {
      const inst = body.installmentPlan.toUpperCase();
      if (!allowedPlans.includes(inst)) {
        throw new BadRequestException('installmentPlan non valido');
      }
      if (publicSub.installmentPlan !== inst) {
        data.installmentPlan = inst as any;
        // Se cambia il piano, invalida la subscription Stripe cosi ne creiamo una nuova al prossimo checkout
        data.stripeSubscriptionId = null;
      }
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nessun campo aggiornabile fornito');
    }

    // Aggiorna PUBLIC (fonte di verita)
    const updatedPublic = await (this.prismaPublic as any).subscription.update({
      where: { id: publicSub.id },
      data,
    });

    // Aggiorna o crea il mirror TENANT per evitare errori di allineamento
    let updatedTenant: any = null;
    if (tenantSub) {
      updatedTenant = await (this.prisma as any).subscription.update({
        where: { id: tenantSub.id },
        data,
      });
    } else {
      // Crea un record shadow minimale copiando i campi fondamentali dal PUBLIC
      updatedTenant = await (this.prisma as any).subscription.create({
        data: {
          id: publicSub.id,
          clientId,
          subscriptionPlanId: publicSub.subscriptionPlanId,
          amount: publicSub.amount as any,
          currency: publicSub.currency,
          contractTerm: publicSub.contractTerm,
          installmentPlan:
            data.installmentPlan ?? publicSub.installmentPlan ?? 'ONE_SHOT',
          status: data.status ?? publicSub.status,
          startsAt: publicSub.startsAt ?? undefined,
          nextBillingAt: publicSub.nextBillingAt ?? undefined,
          endsAt: publicSub.endsAt ?? undefined,
          stripeSubscriptionId:
            data.stripeSubscriptionId ?? publicSub.stripeSubscriptionId ?? undefined,
          stripeCustomerId: publicSub.stripeCustomerId ?? undefined,
        },
      });
    }

    // Allineamento del ritorno con l'ultimo stato
    return {
      ...updatedTenant,
      installmentPlan:
        (data.installmentPlan as any) ??
        updatedTenant?.installmentPlan ??
        publicSub.installmentPlan,
      status: (data.status as any) ?? updatedTenant?.status ?? publicSub.status,
      nextBillingAt: updatedTenant?.nextBillingAt ?? publicSub.nextBillingAt,
      startsAt: updatedTenant?.startsAt ?? publicSub.startsAt,
      endsAt: updatedTenant?.endsAt ?? publicSub.endsAt,
      plan: tenantSub?.plan ?? undefined,
    };
  }

  async getPaymentMethod(clientId: string) {
    if (!clientId) throw new BadRequestException('Tenant non valido');
    const lastPayment = await (this.prisma as any).payment.findFirst({
      where: { clientId },
      orderBy: [{ paymentDate: 'desc' as any }, { createdAt: 'desc' as any }],
      select: { method: true, paymentDate: true },
    });

    return {
      type: lastPayment?.method ?? 'CARTA',
      masked: undefined,
      updatedAt: lastPayment?.paymentDate,
    };
  }

  async updatePaymentMethod(clientId: string, body: any) {
    // Gestito da Stripe/Payment: non è più salvato in una tabella dedicata
    throw new BadRequestException('Il metodo di pagamento è gestito dai pagamenti e non è modificabile manualmente');
  }
}
